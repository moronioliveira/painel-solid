import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db";
import { alerts, clients, dailyMetrics, workspaces } from "@/db/schema";
import { syncAlerts } from "@/lib/alerts/sync";
import { eachDay } from "@/lib/dates";
import { findClientByKey, ingestForClient, ingestPayloadSchema } from "@/lib/ingest";
import { generateIngestKey, generateReportToken } from "@/lib/keys";

let db: Db;
let wsId: string;

async function newClient(name: string, extra: Partial<typeof clients.$inferInsert> = {}) {
  const k = generateIngestKey();
  const [c] = await db
    .insert(clients)
    .values({ workspaceId: wsId, name, ingestKeyHash: k.hash, ingestKeyHint: k.hint, reportToken: generateReportToken(), ...extra })
    .returning();
  return { client: c, key: k.key };
}

const row = (date: string, campaignId: string, costMicros: number, conversions = 0) => ({
  date, campaignId, campaignName: `Campanha ${campaignId}`, impressions: 100, clicks: 10, costMicros, conversions,
});

beforeAll(async () => {
  db = await createPgliteDb("memory");
  const [ws] = await db.insert(workspaces).values({ name: "Teste" }).returning();
  wsId = ws.id;
});

describe("validação do envio", () => {
  it("converte costMicros em reais", () => {
    const p = ingestPayloadSchema.parse({ from: "2026-11-01", to: "2026-11-01", rows: [row("2026-11-01", "1", 12_340_000)] });
    expect(p.rows[0].cost).toBe(12.34);
  });

  it.each([
    ["data inválida", { from: "2026-13-01", to: "2026-11-01", rows: [] }],
    ["from depois de to", { from: "2026-11-02", to: "2026-11-01", rows: [] }],
    ["linha fora do período", { from: "2026-11-01", to: "2026-11-02", rows: [row("2026-11-05", "1", 1)] }],
    ["número negativo", { from: "2026-11-01", to: "2026-11-01", rows: [{ ...row("2026-11-01", "1", 1), clicks: -1 }] }],
    ["período gigante", { from: "2020-01-01", to: "2026-11-01", rows: [] }],
    ["sem rows", { from: "2026-11-01", to: "2026-11-01" }],
  ])("recusa %s", (_, payload) => expect(ingestPayloadSchema.safeParse(payload).success).toBe(false));
});

describe("chave do cliente", () => {
  it("acha o cliente pela chave e recusa chave errada ou cliente inativo", async () => {
    const a = await newClient("Chave A");
    const off = await newClient("Inativo", { active: false });
    expect((await findClientByKey(db, a.key))?.id).toBe(a.client.id);
    expect(await findClientByKey(db, a.key + "x")).toBeNull();
    expect(await findClientByKey(db, "qualquer")).toBeNull();
    expect(await findClientByKey(db, off.key)).toBeNull();
  });
});

describe("gravação", () => {
  it("reenviar o mesmo período substitui em vez de duplicar, e não toca em outro cliente", async () => {
    const a = await newClient("A");
    const b = await newClient("B");
    const send = (c: typeof a, rows: ReturnType<typeof row>[]) =>
      ingestForClient(db, c.client, ingestPayloadSchema.parse({ customerId: "111-222-3333", from: "2026-11-01", to: "2026-11-03", rows }), "script");

    await send(b, [row("2026-11-02", "9", 5_000_000)]);
    await send(a, [row("2026-11-01", "1", 10_000_000, 1), row("2026-11-02", "1", 20_000_000), row("2026-11-03", "2", 7_000_000)]);
    // correção: dia 2 muda de valor e o dia 3 some
    await send(a, [row("2026-11-01", "1", 10_000_000, 2), row("2026-11-02", "1", 25_000_000)]);

    const rowsA = await db.select().from(dailyMetrics).where(eq(dailyMetrics.clientId, a.client.id));
    expect(rowsA.map((r) => [r.date, r.cost, r.conversions]).sort()).toEqual([["2026-11-01", 10, 2], ["2026-11-02", 25, 0]]);
    expect(rowsA.every((r) => r.workspaceId === wsId)).toBe(true);
    expect(await db.select().from(dailyMetrics).where(eq(dailyMetrics.clientId, b.client.id))).toHaveLength(1);

    const [saved] = await db.select().from(clients).where(eq(clients.id, a.client.id));
    expect(saved).toMatchObject({ adsCustomerId: "111-222-3333", lastIngestSource: "script" });
    expect(saved.lastIngestAt).toBeInstanceOf(Date);
  });

  it("dias fora do período enviado ficam intactos", async () => {
    const c = await newClient("Janela");
    const p = (from: string, to: string, rows: ReturnType<typeof row>[]) => ingestPayloadSchema.parse({ from, to, rows });
    await ingestForClient(db, c.client, p("2026-10-01", "2026-10-02", [row("2026-10-01", "1", 1_000_000), row("2026-10-02", "1", 1_000_000)]), "csv");
    await ingestForClient(db, c.client, p("2026-10-02", "2026-10-03", [row("2026-10-03", "1", 3_000_000)]), "csv");
    const rows = await db.select().from(dailyMetrics).where(eq(dailyMetrics.clientId, c.client.id));
    expect(rows.map((r) => r.date).sort()).toEqual(["2026-10-01", "2026-10-03"]);
  });

  it("soma linhas repetidas do mesmo dia e campanha", async () => {
    const c = await newClient("Repetidas");
    const res = await ingestForClient(db, c.client, ingestPayloadSchema.parse({ from: "2026-11-01", to: "2026-11-01", rows: [row("2026-11-01", "1", 1_500_000, 1), row("2026-11-01", "1", 2_500_000, 0.5)] }), "csv");
    expect(res.rows).toBe(1);
    const [r] = await db.select().from(dailyMetrics).where(eq(dailyMetrics.clientId, c.client.id));
    expect(r).toMatchObject({ cost: 4, conversions: 1.5, impressions: 200 });
  });
});

describe("alertas no banco", () => {
  it("abre, mantém sem duplicar e resolve quando o problema some", async () => {
    const now = new Date("2026-11-16T15:00:00Z");
    const c = await newClient("Alertas", { monthlyBudget: 300 });
    const send = (cost: number) =>
      ingestForClient(db, c.client, ingestPayloadSchema.parse({
        from: "2026-11-01", to: "2026-11-15",
        rows: eachDay("2026-11-01", "2026-11-15").map((d) => row(d, "1", cost * 1_000_000, 1)),
      }), "script", now);
    const mine = () => db.select().from(alerts).where(eq(alerts.clientId, c.client.id));

    await send(30); // 450 gastos para verba de 300
    await syncAlerts(db, wsId, { clientId: c.client.id, now });
    await syncAlerts(db, wsId, { now });
    let rows = await mine();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "budget_over", severity: "critical", status: "open" });

    await send(10); // 150 gastos, projeção 300: dentro da verba
    await syncAlerts(db, wsId, { clientId: c.client.id, now });
    rows = await mine();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("resolved");
    expect(rows[0].resolvedAt).toBeInstanceOf(Date);
  });
});
