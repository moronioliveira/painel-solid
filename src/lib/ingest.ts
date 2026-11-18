import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { campaigns, clients, conversionActions, dailyMetrics, keywords, searchTerms, type Client } from "@/db/schema";
import { diffDays, isIsoDate } from "./dates";
import { hashKey } from "./keys";

const isoDate = z.string().refine(isIsoDate, "data inválida (use AAAA-MM-DD)");
const count = z.coerce.number().int().min(0).max(2_000_000_000);
const amount = z.coerce.number().min(0).max(1_000_000_000);
/** Parcela de 0 a 1; ausente ou nula quando o Google não informa. */
const share = z.coerce.number().min(0).max(1).nullable().optional();
/** O script manda custo em milionésimos. */
const micros = z.coerce.number().min(0).max(1e15).default(0).transform((m) => m / 1_000_000);
const qualityLevel = z.string().max(40).nullable().optional();

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
    impressionShare: share,
    lostBudgetShare: share,
    lostRankShare: share,
  })
  .transform(({ costMicros, cost, ...row }) => ({
    ...row,
    cost: cost ?? (costMicros ?? 0) / 1_000_000,
  }));

const searchTermSchema = z
  .object({
    date: isoDate,
    campaignId: z.coerce.string().min(1).max(200),
    term: z.string().min(1).max(500),
    impressions: count.default(0),
    clicks: count.default(0),
    costMicros: micros,
    conversions: amount.default(0),
  })
  .transform(({ costMicros, ...t }) => ({ ...t, cost: costMicros }));

const keywordSchema = z
  .object({
    id: z.coerce.string().min(1).max(200),
    campaignName: z.string().max(500).default(""),
    text: z.string().min(1).max(500),
    matchType: z.string().max(40).default(""),
    qualityScore: z.coerce.number().int().min(1).max(10).nullable().optional(),
    adRelevance: qualityLevel,
    landingPage: qualityLevel,
    expectedCtr: qualityLevel,
    impressions: count.default(0),
    clicks: count.default(0),
    costMicros: micros,
    conversions: amount.default(0),
  })
  .transform(({ costMicros, ...k }) => ({ ...k, cost: costMicros }));

const conversionActionSchema = z.object({
  id: z.coerce.string().min(1).max(200),
  name: z.string().max(500),
  status: z.string().max(40),
  category: z.string().max(80).default(""),
  primary: z.boolean().default(false),
  conversions30d: amount.default(0),
  lastConversionDate: isoDate.nullable().optional(),
});

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
    /** Campos abaixo vêm só do script novo. Ausentes, o que já existe no painel fica como está. */
    searchTerms: z.array(searchTermSchema).max(50_000).optional(),
    keywords: z.array(keywordSchema).max(20_000).optional(),
    conversionActions: z.array(conversionActionSchema).max(1_000).optional(),
    /** Consultas extras que falharam no script (só para registro). */
    extrasErrors: z.array(z.string().max(500)).max(20).optional(),
  })
  .superRefine((p, ctx) => {
    if (p.from > p.to) ctx.addIssue({ code: "custom", message: "`from` depois de `to`" });
    else if (diffDays(p.to, p.from) > 400)
      ctx.addIssue({ code: "custom", message: "período maior que 400 dias" });
    const outside = p.rows.find((r) => r.date < p.from || r.date > p.to);
    if (outside)
      ctx.addIssue({ code: "custom", message: `linha com data ${outside.date} fora do período` });
    const termOutside = p.searchTerms?.find((t) => t.date < p.from || t.date > p.to);
    if (termOutside)
      ctx.addIssue({ code: "custom", message: `termo de pesquisa com data ${termOutside.date} fora do período` });
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
    impressionShare: r.impressionShare ?? null,
    lostBudgetShare: r.lostBudgetShare ?? null,
    lostRankShare: r.lostRankShare ?? null,
  }));
  const termRows = mergeTerms(payload.searchTerms ?? []).map((t) => ({
    workspaceId: client.workspaceId,
    clientId: client.id,
    ...t,
    cost: round2(t.cost),
    conversions: round2(t.conversions),
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
    if (payload.searchTerms) {
      await tx
        .delete(searchTerms)
        .where(and(eq(searchTerms.clientId, client.id), gte(searchTerms.date, payload.from), lte(searchTerms.date, payload.to)));
      for (let i = 0; i < termRows.length; i += 500) await tx.insert(searchTerms).values(termRows.slice(i, i + 500));
    }
    if (payload.keywords) {
      await tx.delete(keywords).where(eq(keywords.clientId, client.id));
      const list = mergeById(payload.keywords).map((k) => ({
        workspaceId: client.workspaceId,
        clientId: client.id,
        keywordId: k.id,
        campaignName: k.campaignName,
        text: k.text,
        matchType: k.matchType.toUpperCase(),
        qualityScore: k.qualityScore ?? null,
        adRelevance: k.adRelevance ?? null,
        landingPage: k.landingPage ?? null,
        expectedCtr: k.expectedCtr ?? null,
        impressions: k.impressions,
        clicks: k.clicks,
        cost: round2(k.cost),
        conversions: round2(k.conversions),
        updatedAt: now,
      }));
      for (let i = 0; i < list.length; i += 500) await tx.insert(keywords).values(list.slice(i, i + 500));
    }
    if (payload.conversionActions) {
      await tx.delete(conversionActions).where(eq(conversionActions.clientId, client.id));
      const list = mergeById(payload.conversionActions).map((c) => ({
        workspaceId: client.workspaceId,
        clientId: client.id,
        actionId: c.id,
        name: c.name,
        status: c.status.toUpperCase(),
        category: c.category,
        primary: c.primary,
        conversions30d: round2(c.conversions30d),
        lastConversionDate: c.lastConversionDate ?? null,
        updatedAt: now,
      }));
      if (list.length) await tx.insert(conversionActions).values(list);
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

type TermIn = NonNullable<IngestPayload["searchTerms"]>[number];

/** Soma o mesmo termo no mesmo dia e campanha (o Google separa por grupo de anúncios e correspondência). */
function mergeTerms(list: TermIn[]): TermIn[] {
  const out = new Map<string, TermIn>();
  for (const t of list) {
    const id = `${t.date}|${t.campaignId}|${t.term}`;
    const prev = out.get(id);
    if (!prev) out.set(id, { ...t });
    else {
      prev.impressions += t.impressions;
      prev.clicks += t.clicks;
      prev.cost += t.cost;
      prev.conversions += t.conversions;
    }
  }
  return [...out.values()];
}

/** Fica com a última ocorrência de cada id (evita erro de chave repetida). */
function mergeById<T extends { id: string }>(list: T[]): T[] {
  return [...new Map(list.map((x) => [x.id, x])).values()];
}
