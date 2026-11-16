import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { campaigns, clients, dailyMetrics, type Client } from "@/db/schema";
import { diffDays, isIsoDate } from "./dates";
import { hashKey } from "./keys";

const isoDate = z.string().refine(isIsoDate, "data inválida (use AAAA-MM-DD)");
const count = z.coerce.number().int().min(0).max(2_000_000_000);
const amount = z.coerce.number().min(0).max(1_000_000_000);

const rowSchema = z
  .object({
    date: isoDate,
    campaignId: z.coerce.string().min(1).max(200),
    campaignName: z.string().max(500).default(""),
    impressions: count.default(0),
    clicks: count.default(0),
    /** O script manda costMicros (milionésimos); o CSV manda cost. */
    costMicros: z.coerce.number().min(0).optional(),
    cost: amount.optional(),
    conversions: amount.default(0),
    conversionsValue: amount.default(0),
  })
  .transform(({ costMicros, cost, ...row }) => ({
    ...row,
    cost: cost ?? (costMicros ?? 0) / 1_000_000,
  }));

export const ingestPayloadSchema = z
  .object({
    customerId: z.string().max(40).optional(),
    from: isoDate,
    to: isoDate,
    rows: z.array(rowSchema).max(50_000),
    campaigns: z
      .array(
        z.object({
          id: z.coerce.string().min(1).max(200),
          name: z.string().max(500),
          status: z.string().max(40),
        }),
      )
      .max(10_000)
      .optional(),
  })
  .superRefine((p, ctx) => {
    if (p.from > p.to) ctx.addIssue({ code: "custom", message: "`from` depois de `to`" });
    else if (diffDays(p.to, p.from) > 400)
      ctx.addIssue({ code: "custom", message: "período maior que 400 dias" });
    const outside = p.rows.find((r) => r.date < p.from || r.date > p.to);
    if (outside)
      ctx.addIssue({ code: "custom", message: `linha com data ${outside.date} fora do período` });
  });

export type IngestPayload = z.output<typeof ingestPayloadSchema>;
export type IngestSource = "script" | "csv";

export async function findClientByKey(db: Db, key: string): Promise<Client | null> {
  if (!key.startsWith("ps_") || key.length > 200) return null;
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.ingestKeyHash, hashKey(key)), eq(clients.active, true)));
  return client ?? null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Grava um envio. O período [from, to] do cliente é substituído inteiro,
 * então reenviar os mesmos dias nunca duplica e correções do Google entram.
 */
export async function ingestForClient(
  db: Db,
  client: Pick<Client, "id" | "workspaceId">,
  payload: IngestPayload,
  source: IngestSource,
  now: Date = new Date(),
): Promise<{ rows: number; days: number }> {
  // Soma linhas repetidas do mesmo dia e campanha (o CSV pode vir segmentado).
  const merged = new Map<string, (typeof payload.rows)[number]>();
  for (const row of payload.rows) {
    const id = `${row.date}|${row.campaignId}`;
    const prev = merged.get(id);
    if (!prev) merged.set(id, { ...row });
    else {
      prev.impressions += row.impressions;
      prev.clicks += row.clicks;
      prev.cost += row.cost;
      prev.conversions += row.conversions;
      prev.conversionsValue += row.conversionsValue;
      if (!prev.campaignName) prev.campaignName = row.campaignName;
    }
  }
  const rows = [...merged.values()].map((r) => ({
    workspaceId: client.workspaceId,
    clientId: client.id,
    date: r.date,
    campaignId: r.campaignId,
    campaignName: r.campaignName || r.campaignId,
    impressions: r.impressions,
    clicks: r.clicks,
    cost: round2(r.cost),
    conversions: round2(r.conversions),
    conversionsValue: round2(r.conversionsValue),
  }));

  await db.transaction(async (tx) => {
    await tx
      .delete(dailyMetrics)
      .where(
        and(
          eq(dailyMetrics.clientId, client.id),
          gte(dailyMetrics.date, payload.from),
          lte(dailyMetrics.date, payload.to),
        ),
      );
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(dailyMetrics).values(rows.slice(i, i + 500));
    }
    if (payload.campaigns?.length) {
      const list = payload.campaigns.map((c) => ({
        workspaceId: client.workspaceId,
        clientId: client.id,
        campaignId: c.id,
        name: c.name,
        status: c.status.toUpperCase(),
        updatedAt: now,
      }));
      for (let i = 0; i < list.length; i += 500) {
        await tx
          .insert(campaigns)
          .values(list.slice(i, i + 500))
          .onConflictDoUpdate({
            target: [campaigns.clientId, campaigns.campaignId],
            set: {
              name: sql`excluded.name`,
              status: sql`excluded.status`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
      }
    }
    await tx
      .update(clients)
      .set({
        lastIngestAt: now,
        lastIngestSource: source,
        ...(payload.customerId ? { adsCustomerId: payload.customerId } : {}),
      })
      .where(eq(clients.id, client.id));
  });

  return { rows: rows.length, days: diffDays(payload.to, payload.from) + 1 };
}
