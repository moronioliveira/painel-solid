import { beforeAll, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db";
import { clients, workspaces } from "@/db/schema";
import { openAlerts, syncAlerts } from "@/lib/alerts/sync";
import { getClient, getClientByReportToken } from "@/lib/clients";
import { eachDay } from "@/lib/dates";
import { ingestForClient, ingestPayloadSchema } from "@/lib/ingest";
import { generateIngestKey, generateReportToken } from "@/lib/keys";
import { totalsByClient } from "@/lib/metrics";
import { loadOverview } from "@/lib/overview";
import { buildMonthlyReport } from "@/lib/report";

let db: Db;
let wsA: string;
let wsB: string;
let clientA: typeof clients.$inferSelect;
let clientB: typeof clients.$inferSelect;
const now = new Date("2026-11-16T15:00:00Z");

async function seed(workspaceId: string, name: string, cost: number) {
  const k = generateIngestKey();
  const [c] = await db
    .insert(clients)
    .values({ workspaceId, name, monthlyBudget: 100, ingestKeyHash: k.hash, ingestKeyHint: k.hint, reportToken: generateReportToken() })
    .returning();
  await ingestForClient(db, c, ingestPayloadSchema.parse({
    from: "2026-10-01", to: "2026-11-15",
    rows: eachDay("2026-10-01", "2026-11-15").map((date) => ({ date, campaignId: "1", campaignName: "C", impressions: 100, clicks: 10, cost, conversions: 1 })),
  }), "script", now);
  return c;
}

beforeAll(async () => {
  db = await createPgliteDb("memory");
  [{ id: wsA }] = await db.insert(workspaces).values({ name: "A" }).returning();
  [{ id: wsB }] = await db.insert(workspaces).values({ name: "B" }).returning();
  clientA = await seed(wsA, "Cliente de A", 10);
  clientB = await seed(wsB, "Cliente de B", 99);
  await syncAlerts(db, wsA, { now });
  await syncAlerts(db, wsB, { now });
});

it("um workspace não enxerga cliente, totais nem alertas do outro", async () => {
  expect(await getClient(db, wsA, clientB.id)).toBeNull();
  expect((await getClient(db, wsA, clientA.id))?.name).toBe("Cliente de A");
  expect(await getClient(db, wsA, "não-é-uuid")).toBeNull();

  const totals = await totalsByClient(db, wsA, "2026-11-01", "2026-11-15");
  expect([...totals.keys()]).toEqual([clientA.id]);
  expect(totals.get(clientA.id)).toMatchObject({ cost: 150, conversions: 15, clicks: 150 });

  const overview = await loadOverview(db, wsA, "2026-11-16");
  expect(overview.rows.map((r) => r.client.name)).toEqual(["Cliente de A"]);
  expect(overview.rows[0].previous.cost).toBe(150); // 1 a 15 de outubro
  expect(overview.expectedShare).toBe(0.5);

  const alertsA = await openAlerts(db, wsA);
  expect(alertsA.length).toBeGreaterThan(0);
  expect(alertsA.every((a) => a.clientId === clientA.id)).toBe(true);
});

it("relatório: token certo abre só o próprio cliente; mês fechado e mês em andamento batem com os dados", async () => {
  expect((await getClientByReportToken(db, clientA.reportToken))?.id).toBe(clientA.id);
  expect(await getClientByReportToken(db, "token-que-nao-existe-0000")).toBeNull();
  expect(await getClientByReportToken(db, "x")).toBeNull();

  const october = await buildMonthlyReport(db, clientA, "2026-10", "2026-11-16");
  expect(october).toMatchObject({ partial: false, from: "2026-10-01", to: "2026-10-31" });
  expect(october!.totals).toMatchObject({ cost: 310, conversions: 31 });
  expect(october!.daily).toHaveLength(31);
  expect(october!.prevTotals.cost).toBe(0);

  const november = await buildMonthlyReport(db, clientA, "2026-11", "2026-11-16");
  expect(november).toMatchObject({ partial: true, to: "2026-11-15" });
  expect(november!.totals.cost).toBe(150);
  expect(november!.prevTotals.cost).toBe(150);

  expect(await buildMonthlyReport(db, clientA, "2026-12", "2026-11-16")).toBeNull();
});
