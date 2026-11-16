import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { campaigns, dailyMetrics } from "@/db/schema";
import { eachDay } from "./dates";

export type Totals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionsValue: number;
};

export const ZERO: Totals = { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionsValue: 0 };

const sums = {
  impressions: sql<number>`coalesce(sum(${dailyMetrics.impressions}), 0)::float8`.mapWith(Number),
  clicks: sql<number>`coalesce(sum(${dailyMetrics.clicks}), 0)::float8`.mapWith(Number),
  cost: sql<number>`coalesce(sum(${dailyMetrics.cost}), 0)::float8`.mapWith(Number),
  conversions: sql<number>`coalesce(sum(${dailyMetrics.conversions}), 0)::float8`.mapWith(Number),
  conversionsValue: sql<number>`coalesce(sum(${dailyMetrics.conversionsValue}), 0)::float8`.mapWith(Number),
};

export function sumTotals(rows: Totals[]): Totals {
  return rows.reduce<Totals>(
    (a, r) => ({
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      cost: a.cost + r.cost,
      conversions: a.conversions + r.conversions,
      conversionsValue: a.conversionsValue + r.conversionsValue,
    }),
    { ...ZERO },
  );
}

export type DayTotals = Totals & { date: string };

/** Totais do cliente por dia; dias sem dados vêm zerados. */
export async function dailyTotals(db: Db, clientId: string, from: string, to: string): Promise<DayTotals[]> {
  if (from > to) return [];
  const rows = await db
    .select({ date: dailyMetrics.date, ...sums })
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.clientId, clientId), gte(dailyMetrics.date, from), lte(dailyMetrics.date, to)))
    .groupBy(dailyMetrics.date);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return eachDay(from, to).map((date) => byDate.get(date) ?? { date, ...ZERO });
}

export type CampaignTotals = Totals & { campaignId: string; campaignName: string; status: string | null };

export async function campaignTotals(db: Db, clientId: string, from: string, to: string): Promise<CampaignTotals[]> {
  if (from > to) return [];
  const rows = await db
    .select({
      campaignId: dailyMetrics.campaignId,
      campaignName: sql<string>`max(${dailyMetrics.campaignName})`,
      ...sums,
    })
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.clientId, clientId), gte(dailyMetrics.date, from), lte(dailyMetrics.date, to)))
    .groupBy(dailyMetrics.campaignId);
  const list = await db.select().from(campaigns).where(eq(campaigns.clientId, clientId));
  const info = new Map(list.map((c) => [c.campaignId, c]));
  return rows
    .map((r) => ({
      ...r,
      campaignName: info.get(r.campaignId)?.name ?? r.campaignName,
      status: info.get(r.campaignId)?.status ?? null,
    }))
    .sort((a, b) => b.cost - a.cost);
}

/** Totais de cada cliente do workspace no período. */
export async function totalsByClient(db: Db, workspaceId: string, from: string, to: string): Promise<Map<string, Totals>> {
  if (from > to) return new Map();
  const rows = await db
    .select({ clientId: dailyMetrics.clientId, ...sums })
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.workspaceId, workspaceId), gte(dailyMetrics.date, from), lte(dailyMetrics.date, to)))
    .groupBy(dailyMetrics.clientId);
  return new Map(rows.map(({ clientId, ...t }) => [clientId, t]));
}

/** Meses (AAAA-MM) em que o cliente tem dados, do mais recente para o mais antigo. */
export async function monthsWithData(db: Db, clientId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ month: sql<string>`to_char(${dailyMetrics.date}, 'YYYY-MM')` })
    .from(dailyMetrics)
    .where(eq(dailyMetrics.clientId, clientId));
  return rows.map((r) => r.month).sort().reverse();
}
