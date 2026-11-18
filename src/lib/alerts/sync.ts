import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { alerts, campaigns, clients, conversionActions, dailyMetrics, workspaces } from "@/db/schema";
import { addDays, minDate, monthStart, todayInTz } from "../dates";
import { evaluateAlerts } from "./evaluate";
import type { Finding } from "./types";

/**
 * Reavalia os alertas dos clientes ativos de um workspace e ajusta a tabela:
 * abre os novos, atualiza os que continuam e resolve os que sumiram.
 */
export async function syncAlerts(
  db: Db,
  workspaceId: string,
  opts: { clientId?: string; now?: Date } = {},
): Promise<void> {
  const now = opts.now ?? new Date();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) return;
  const today = todayInTz(ws.timezone, now);
  const since = minDate(monthStart(today), addDays(today, -35));

  const targets = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.workspaceId, workspaceId),
        eq(clients.active, true),
        opts.clientId ? eq(clients.id, opts.clientId) : undefined,
      ),
    );
  if (targets.length === 0) return;
  const ids = targets.map((c) => c.id);

  const [metricRows, campaignRows, openRows, actionRows] = await Promise.all([
    db
      .select({
        clientId: dailyMetrics.clientId,
        date: dailyMetrics.date,
        campaignId: dailyMetrics.campaignId,
        impressions: dailyMetrics.impressions,
        cost: dailyMetrics.cost,
        conversions: dailyMetrics.conversions,
        impressionShare: dailyMetrics.impressionShare,
        lostBudgetShare: dailyMetrics.lostBudgetShare,
        lostRankShare: dailyMetrics.lostRankShare,
      })
      .from(dailyMetrics)
      .where(and(inArray(dailyMetrics.clientId, ids), gte(dailyMetrics.date, since))),
    db.select().from(campaigns).where(inArray(campaigns.clientId, ids)),
    db
      .select()
      .from(alerts)
      .where(and(inArray(alerts.clientId, ids), eq(alerts.status, "open"))),
    db.select().from(conversionActions).where(inArray(conversionActions.clientId, ids)),
  ]);

  for (const client of targets) {
    const mine = metricRows.filter((r) => r.clientId === client.id);
    const perDay = new Map<string, { date: string; cost: number; conversions: number }>();
    for (const r of mine) {
      const d = perDay.get(r.date) ?? { date: r.date, cost: 0, conversions: 0 };
      d.cost += r.cost;
      d.conversions += r.conversions;
      perDay.set(r.date, d);
    }
    const findings = evaluateAlerts({
      today,
      now,
      timezone: ws.timezone,
      client,
      daily: [...perDay.values()],
      campaigns: campaignRows.filter((c) => c.clientId === client.id),
      campaignDaily: mine,
      // Sem nenhuma ação gravada, o script ainda é o antigo: não dá para afirmar nada sobre a medição.
      conversionActions: (() => {
        const list = actionRows.filter((a) => a.clientId === client.id);
        return list.length ? list : undefined;
      })(),
      campaignReach: mine,
    });
    await reconcile(
      db,
      client,
      findings,
      openRows.filter((a) => a.clientId === client.id),
      now,
    );
  }
}

async function reconcile(
  db: Db,
  client: { id: string; workspaceId: string },
  findings: Finding[],
  open: (typeof alerts.$inferSelect)[],
  now: Date,
) {
  const idOf = (x: { type: string; key: string }) => `${x.type}|${x.key}`;
  const current = new Map(findings.map((f) => [idOf(f), f]));
  const existing = new Map(open.map((a) => [idOf(a), a]));

  const gone = open.filter((a) => !current.has(idOf(a))).map((a) => a.id);
  if (gone.length) {
    await db
      .update(alerts)
      .set({ status: "resolved", resolvedAt: now })
      .where(inArray(alerts.id, gone));
  }
  for (const f of findings) {
    const prev = existing.get(idOf(f));
    if (prev) {
      await db
        .update(alerts)
        .set({ severity: f.severity, message: f.message, lastSeenAt: now })
        .where(eq(alerts.id, prev.id));
    } else {
      await db.insert(alerts).values({
        workspaceId: client.workspaceId,
        clientId: client.id,
        type: f.type,
        key: f.key,
        severity: f.severity,
        message: f.message,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }
  }
}

/** Alertas abertos por cliente, do mais grave para o mais leve. */
export async function openAlerts(db: Db, workspaceId: string, clientId?: string) {
  return db
    .select({
      id: alerts.id,
      clientId: alerts.clientId,
      clientName: clients.name,
      type: alerts.type,
      severity: alerts.severity,
      message: alerts.message,
      firstSeenAt: alerts.firstSeenAt,
    })
    .from(alerts)
    .innerJoin(clients, eq(clients.id, alerts.clientId))
    .where(
      and(
        eq(alerts.workspaceId, workspaceId),
        eq(alerts.status, "open"),
        eq(clients.active, true),
        clientId ? eq(alerts.clientId, clientId) : undefined,
      ),
    )
    .orderBy(sql`case when ${alerts.severity} = 'critical' then 0 else 1 end`, alerts.firstSeenAt);
}
