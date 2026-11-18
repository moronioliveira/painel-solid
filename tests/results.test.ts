import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db";
import { clients, dailyMetrics, workspaces } from "@/db/schema";
import { businessMetrics, listResults, monthlyCosts, resultSummary, saveResult } from "@/lib/results";

let db: Db;
let ws: string;
let other: string;
let clientId: string;

beforeAll(async () => {
  db = await createPgliteDb("memory");
  const [w] = await db.insert(workspaces).values({ name: "A" }).returning();
  const [w2] = await db.insert(workspaces).values({ name: "B" }).returning();
  ws = w.id;
  other = w2.id;
  const [c] = await db
    .insert(clients)
    .values({ workspaceId: ws, name: "Cliente", ingestKeyHash: "h", ingestKeyHint: "x", reportToken: "t".repeat(20) })
    .returning();
  clientId = c.id;
  await db.insert(dailyMetrics).values([
    { workspaceId: ws, clientId, date: "2026-10-05", campaignId: "1", campaignName: "C", cost: 300, conversions: 10 },
    { workspaceId: ws, clientId, date: "2026-10-20", campaignId: "1", campaignName: "C", cost: 300, conversions: 14 },
    { workspaceId: ws, clientId, date: "2026-11-02", campaignId: "1", campaignName: "C", cost: 120, conversions: 3 },
  ]);
});

describe("indicadores do resultado real", () => {
  it("calcula custo por contato, por contrato, taxa de fechamento e retorno", () => {
    const m = businessMetrics({ cost: 600, conversions: 24 }, { leads: 20, deals: 4, revenue: 6000 });
    expect(m).toEqual({ costPerLead: 30, costPerDeal: 150, closeRate: 0.2, returnPerReal: 10, measuredShare: 1.2 });
  });
  it("deixa vazio o que não dá para calcular", () => {
    const m = businessMetrics({ cost: 0, conversions: 0 }, { leads: 0, deals: null, revenue: null });
    expect(m).toEqual({ costPerLead: null, costPerDeal: null, closeRate: null, returnPerReal: null, measuredShare: null });
  });
});

describe("gravação", () => {
  it("cria, atualiza e apaga quando tudo fica vazio", async () => {
    await saveResult(db, { workspaceId: ws, clientId, month: "2026-10", leads: 20, deals: 4, revenue: 6000 });
    await saveResult(db, { workspaceId: ws, clientId, month: "2026-10", leads: 22, deals: 4, revenue: 6000 });
    expect((await listResults(db, ws, clientId)).map((r) => [r.month, r.leads])).toEqual([["2026-10", 22]]);
    await saveResult(db, { workspaceId: ws, clientId, month: "2026-09", leads: 5, deals: null, revenue: null });
    await saveResult(db, { workspaceId: ws, clientId, month: "2026-09", leads: null, deals: null, revenue: null });
    expect((await listResults(db, ws, clientId)).map((r) => r.month)).toEqual(["2026-10"]);
  });
  it("outro workspace não enxerga nem altera", async () => {
    expect(await listResults(db, other, clientId)).toEqual([]);
    await expect(
      saveResult(db, { workspaceId: other, clientId, month: "2026-10", leads: 1, deals: 1, revenue: 1 }),
    ).rejects.toThrow();
    expect((await listResults(db, ws, clientId))[0].leads).toBe(22);
  });
  it("soma o custo e as conversões de cada mês", async () => {
    const m = await monthlyCosts(db, clientId);
    expect(m.get("2026-10")).toEqual({ cost: 600, conversions: 24 });
    expect(m.get("2026-11")).toEqual({ cost: 120, conversions: 3 });
  });
});

describe("frase do relatório", () => {
  it("resume em linguagem simples", () => {
    const plain = (s: string | null) => s?.replace(/\u00a0/g, " ") ?? null;
    expect(plain(resultSummary({ cost: 600, conversions: 24 }, { leads: 20, deals: 4, revenue: 6000 }))).toBe(
      "No negócio, chegaram 20 conversas de clientes e 4 viraram contratos fechados, somando R$ 6.000,00. Cada R$ 1 investido em anúncios trouxe R$ 10,00 em receita.",
    );
    expect(resultSummary({ cost: 100, conversions: 2 }, { leads: 1, deals: 0, revenue: null })).toBe(
      "No negócio, chegou 1 conversa de cliente e nenhuma virou contrato fechado ainda.",
    );
    expect(resultSummary({ cost: 100, conversions: 2 }, { leads: null, deals: null, revenue: null })).toBeNull();
  });
});
