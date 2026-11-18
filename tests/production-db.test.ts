/**
 * Protege contra o defeito que derrubou o painel em produção em 17/11/2026:
 * o pooler do Supabase trava quando recebe consultas encavaladas, e as páginas
 * ficavam carregando até a Vercel desistir.
 *
 * O teste usa o Postgres local (PGlite) atendendo pela rede, com um intermediário
 * que imita o pooler com defeito, e roda as funções reais do painel por cima.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRODUCTION_DB_OPTIONS, type Db } from "@/db";
import * as schema from "@/db/schema";
import { clients, dailyMetrics, workspaces } from "@/db/schema";
import { syncAlerts } from "@/lib/alerts/sync";
import { addDays, todayInTz } from "@/lib/dates";
import { campaignTotals, dailyTotals, monthsWithData } from "@/lib/metrics";
import { loadOverview } from "@/lib/overview";
import { listResults, monthlyCosts } from "@/lib/results";
import { startFaultyPooler } from "./helpers/faulty-pooler";

let pg: PGlite;
let server: PGLiteSocketServer;
let dbPort: number;
let wsId: string;
let clientId: string;
const today = todayInTz("America/Sao_Paulo");

beforeAll(async () => {
  pg = await PGlite.create();
  const local = drizzlePglite(pg, { schema });
  await migrate(local, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  const [ws] = await local.insert(workspaces).values({ name: "Produção simulada" }).returning();
  wsId = ws.id;
  const [c] = await local
    .insert(clients)
    .values({ workspaceId: wsId, name: "Cliente", ingestKeyHash: "h", ingestKeyHint: "x", reportToken: "t".repeat(24), monthlyBudget: 900, lastIngestAt: new Date(), lastIngestSource: "script" })
    .returning();
  clientId = c.id;
  await local.insert(dailyMetrics).values(
    Array.from({ length: 20 }, (_, i) => ({
      workspaceId: wsId, clientId, date: addDays(today, -(i + 1)), campaignId: "1", campaignName: "Pesquisa",
      impressions: 100, clicks: 10, cost: 30, conversions: 2,
    })),
  );
  server = new PGLiteSocketServer({ db: pg, port: 0, host: "127.0.0.1" });
  await server.start();
  dbPort = (server as unknown as { server: { address(): { port: number } } }).server.address().port;
});

afterAll(async () => {
  await server?.stop();
  await pg?.close();
});

/** O mesmo volume de consultas simultâneas da tela do cliente e da visão geral. */
async function pageWorkload(db: Db) {
  const from = addDays(today, -30);
  await Promise.all([
    syncAlerts(db, wsId),
    loadOverview(db, wsId, today),
    dailyTotals(db, clientId, from, today),
    dailyTotals(db, clientId, addDays(from, -30), from),
    campaignTotals(db, clientId, from, today),
    monthsWithData(db, clientId),
    listResults(db, wsId, clientId),
    monthlyCosts(db, clientId),
    ...Array.from({ length: 6 }, () => db.select().from(clients)),
  ]);
}

const within = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p.then(() => "terminou" as const), new Promise<"travou">((r) => setTimeout(() => r("travou"), ms))]);

describe("conexão de produção com um pooler que trava com consultas encavaladas", () => {
  it("a configuração antiga trava (reproduz o defeito de produção)", async () => {
    const pooler = await startFaultyPooler(dbPort);
    const sql = postgres(`postgres://postgres:postgres@127.0.0.1:${pooler.port}/postgres`, { prepare: false, max: 5 });
    const result = await within(pageWorkload(drizzle(sql, { schema }) as unknown as Db), 4000);
    expect(result).toBe("travou");
    expect(pooler.wedgedConnections()).toBeGreaterThan(0);
    await sql.end({ timeout: 0 });
    await pooler.stop();
  }, 20_000);

  it("a configuração de produção atual carrega as telas sem travar", async () => {
    const pooler = await startFaultyPooler(dbPort);
    const sql = postgres(`postgres://postgres:postgres@127.0.0.1:${pooler.port}/postgres`, PRODUCTION_DB_OPTIONS);
    const db = drizzle(sql, { schema }) as unknown as Db;
    for (let round = 0; round < 3; round++) {
      expect(await within(pageWorkload(db), 10_000)).toBe("terminou");
    }
    expect(pooler.wedgedConnections()).toBe(0);
    await sql.end({ timeout: 0 });
    await pooler.stop();
  }, 60_000);

  it("se o banco parar de responder, a consulta falha com erro em vez de deixar a página carregando", async () => {
    const pooler = await startFaultyPooler(dbPort, "silent");
    // Mesmas opções de produção, só com tempos menores para o teste ser rápido.
    const sql = postgres(`postgres://postgres:postgres@127.0.0.1:${pooler.port}/postgres`, { ...PRODUCTION_DB_OPTIONS, query_timeout: 1, cancel_timeout: 1 });
    const started = Date.now();
    await expect(sql`select 1`).rejects.toMatchObject({ code: "QUERY_TIMEOUT" });
    expect(Date.now() - started).toBeLessThan(6_000);
    await sql.end({ timeout: 0 });
    await pooler.stop();
  }, 20_000);
});

describe("opções de produção", () => {
  it("mantém as proteções contra o pooler travado", () => {
    expect(PRODUCTION_DB_OPTIONS.prepare).toBe(false);
    expect(PRODUCTION_DB_OPTIONS.max_pipeline).toBe(1);
    expect(PRODUCTION_DB_OPTIONS.query_timeout).toBeGreaterThan(0);
    expect(PRODUCTION_DB_OPTIONS.connect_timeout).toBeGreaterThan(0);
  });

  it("a consulta desiste antes de a página atingir o tempo máximo", () => {
    const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
    const maxDuration = Number(layout.match(/export const maxDuration = (\d+)/)?.[1]);
    expect(maxDuration).toBeGreaterThan(0);
    expect(PRODUCTION_DB_OPTIONS.query_timeout + PRODUCTION_DB_OPTIONS.connect_timeout).toBeLessThan(maxDuration);
  });
});
