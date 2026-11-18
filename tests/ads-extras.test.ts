import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db";
import { clients, conversionActions, dailyMetrics, keywords, searchTerms, workspaces } from "@/db/schema";
import { evaluateAlerts } from "@/lib/alerts/evaluate";
import { buildAdsScript } from "@/lib/ads-script";
import { reachByCampaign, reachSentence, searchTermSummary, topTermsSentence, weightedReach } from "@/lib/ads-extras";
import { ingestForClient, ingestPayloadSchema } from "@/lib/ingest";
import { generateIngestKey, generateReportToken } from "@/lib/keys";

let db: Db;
let wsId: string;
let clientId: string;

const row = (date: string, extra: Record<string, unknown> = {}) => ({
  date, campaignId: "1", campaignName: "Pesquisa", impressions: 100, clicks: 10, costMicros: 20_000_000, conversions: 1, ...extra,
});

beforeAll(async () => {
  db = await createPgliteDb("memory");
  const [ws] = await db.insert(workspaces).values({ name: "T" }).returning();
  wsId = ws.id;
  const k = generateIngestKey();
  const [c] = await db
    .insert(clients)
    .values({ workspaceId: wsId, name: "C", ingestKeyHash: k.hash, ingestKeyHint: k.hint, reportToken: generateReportToken() })
    .returning();
  clientId = c.id;
});

describe("envio com os dados novos", () => {
  it("o envio do script antigo continua aceito e não apaga os dados novos", async () => {
    const full = ingestPayloadSchema.parse({
      from: "2026-11-01",
      to: "2026-11-02",
      rows: [row("2026-11-01", { impressionShare: 0.5, lostBudgetShare: 0.3, lostRankShare: 0.2 }), row("2026-11-02")],
      searchTerms: [
        { date: "2026-11-01", campaignId: "1", term: "advogado trabalhista", impressions: 50, clicks: 5, costMicros: 15_000_000, conversions: 2 },
        { date: "2026-11-01", campaignId: "1", term: "advogado trabalhista", impressions: 10, clicks: 1, costMicros: 1_000_000, conversions: 0 },
        { date: "2026-11-02", campaignId: "1", term: "curso de direito grátis", impressions: 30, clicks: 4, costMicros: 12_000_000, conversions: 0 },
      ],
      keywords: [
        { id: "10~20", campaignName: "Pesquisa", text: "advogado trabalhista", matchType: "PHRASE", qualityScore: 4, adRelevance: "AVERAGE", landingPage: "BELOW_AVERAGE", expectedCtr: "AVERAGE", impressions: 60, clicks: 6, costMicros: 16_000_000, conversions: 2 },
        { id: "10~21", campaignName: "Pesquisa", text: "rescisão indireta", matchType: "EXACT", impressions: 3, clicks: 0, costMicros: 0, conversions: 0 },
      ],
      conversionActions: [
        { id: "99", name: "Contato WhatsApp", status: "ENABLED", category: "CONTACT", primary: true, conversions30d: 3, lastConversionDate: "2026-11-02" },
      ],
    });
    await ingestForClient(db, { id: clientId, workspaceId: wsId }, full, "script");

    const [d] = await db.select().from(dailyMetrics).where(eq(dailyMetrics.date, "2026-11-01"));
    expect([d.impressionShare, d.lostBudgetShare, d.lostRankShare]).toEqual([0.5, 0.3, 0.2]);
    const terms = await db.select().from(searchTerms).where(eq(searchTerms.clientId, clientId));
    expect(terms).toHaveLength(2); // o termo repetido no mesmo dia foi somado
    expect(terms.find((t) => t.term === "advogado trabalhista")).toMatchObject({ clicks: 6, cost: 16 });
    const kws = await db.select().from(keywords).where(eq(keywords.clientId, clientId));
    expect(kws.find((k) => k.keywordId === "10~21")?.qualityScore).toBeNull();
    expect(await db.select().from(conversionActions)).toHaveLength(1);

    const old = ingestPayloadSchema.parse({ from: "2026-11-01", to: "2026-11-02", rows: [row("2026-11-01"), row("2026-11-02")] });
    await ingestForClient(db, { id: clientId, workspaceId: wsId }, old, "script");
    expect(await db.select().from(searchTerms)).toHaveLength(2);
    expect(await db.select().from(keywords)).toHaveLength(2);
  });

  it("um novo envio substitui palavras-chave e conversões", async () => {
    const p = ingestPayloadSchema.parse({
      from: "2026-11-01",
      to: "2026-11-02",
      rows: [],
      keywords: [],
      conversionActions: [{ id: "1", name: "Outra", status: "HIDDEN", category: "", primary: false, conversions30d: 0 }],
    });
    await ingestForClient(db, { id: clientId, workspaceId: wsId }, p, "script");
    expect(await db.select().from(keywords)).toHaveLength(0);
    expect((await db.select().from(conversionActions)).map((c) => c.name)).toEqual(["Outra"]);
  });

  it("recusa parcela de impressões fora de 0 a 1", () => {
    expect(ingestPayloadSchema.safeParse({ from: "2026-11-01", to: "2026-11-01", rows: [row("2026-11-01", { impressionShare: 1.5 })] }).success).toBe(false);
  });
});

describe("alcance", () => {
  it("pondera pela quantidade de buscas possíveis", () => {
    // Dia A: 100 impressões com 50% => 200 buscas possíveis. Dia B: 300 com 100% => 300.
    const r = weightedReach([
      { impressions: 100, impressionShare: 0.5, lostBudgetShare: 0.5, lostRankShare: 0 },
      { impressions: 300, impressionShare: 1, lostBudgetShare: 0, lostRankShare: 0 },
      { impressions: 50, impressionShare: null, lostBudgetShare: null, lostRankShare: null },
    ]);
    expect(r).toEqual({ share: 0.8, lostBudget: 0.2, lostRank: 0 });
    expect(weightedReach([{ impressions: 10, impressionShare: null, lostBudgetShare: null, lostRankShare: null }])).toBeNull();
  });

  it("agrupa por campanha", () => {
    const m = reachByCampaign([
      { campaignId: "1", impressions: 100, impressionShare: 0.5, lostBudgetShare: 0.4, lostRankShare: 0.1 },
      { campaignId: "2", impressions: 100, impressionShare: null, lostBudgetShare: null, lostRankShare: null },
    ]);
    expect(m.get("1")).toEqual({ share: 0.5, lostBudget: 0.4, lostRank: 0.1 });
    expect(m.has("2")).toBe(false);
  });

  it("frase simples para o cliente", () => {
    expect(reachSentence({ share: 0.62, lostBudget: 0.25, lostRank: 0.13 })).toBe(
      "Os anúncios apareceram em 62% das buscas em que poderiam aparecer. Em 25% delas não apareceram porque a verba do dia já tinha acabado.",
    );
    expect(reachSentence({ share: 0.9, lostBudget: 0.02, lostRank: 0.08 })).toBe("Os anúncios apareceram em 90% das buscas em que poderiam aparecer.");
    expect(reachSentence(null)).toBeNull();
  });
});

describe("termos de pesquisa", () => {
  const rows = [
    { term: "advogado trabalhista", impressions: 60, clicks: 6, cost: 16, conversions: 2 },
    { term: "Advogado Trabalhista", impressions: 10, clicks: 1, cost: 4, conversions: 1 },
    { term: "curso de direito grátis", impressions: 30, clicks: 4, cost: 12, conversions: 0 },
    { term: "rescisão indireta", impressions: 20, clicks: 2, cost: 5, conversions: 1 },
    { term: "fgts atrasado", impressions: 5, clicks: 1, cost: 2, conversions: 0 },
  ];
  it("soma por termo, ordena por gasto e marca gasto sem contato", () => {
    const s = searchTermSummary(rows);
    expect(s[0]).toMatchObject({ term: "advogado trabalhista", cost: 20, conversions: 3, wasted: false });
    expect(s.find((t) => t.term === "curso de direito grátis")?.wasted).toBe(true);
    expect(s.find((t) => t.term === "fgts atrasado")?.wasted).toBe(false); // gasto pequeno demais para concluir
  });
  it("frase com as buscas que mais trouxeram contatos", () => {
    expect(topTermsSentence(searchTermSummary(rows))).toBe('As buscas que mais trouxeram contatos foram "advogado trabalhista" e "rescisão indireta".');
    expect(topTermsSentence([])).toBeNull();
  });
});

describe("alertas novos", () => {
  const base = {
    today: "2026-11-20",
    now: new Date("2026-11-20T12:00:00Z"),
    timezone: "America/Sao_Paulo",
    client: { monthlyBudget: null, targetCpl: null, lastIngestAt: new Date("2026-11-20T09:00:00Z"), lastIngestSource: "script" },
    daily: [],
    campaigns: [{ campaignId: "1", name: "Pesquisa", status: "ENABLED" }],
    campaignDaily: [],
  };
  it("avisa quando nenhuma conversão principal está ativa", () => {
    const f = evaluateAlerts({ ...base, conversionActions: [{ name: "Antiga", status: "ENABLED", primary: false }] });
    expect(f.find((x) => x.type === "conversion_setup")?.severity).toBe("critical");
    const ok = evaluateAlerts({ ...base, conversionActions: [{ name: "Contato WhatsApp", status: "ENABLED", primary: true }] });
    expect(ok.find((x) => x.type === "conversion_setup")).toBeUndefined();
    // Script antigo não manda conversões: não acusa nada.
    expect(evaluateAlerts(base).find((x) => x.type === "conversion_setup")).toBeUndefined();
  });
  it("avisa campanha ativa perdendo muitas buscas por verba nos últimos 7 dias", () => {
    const days = ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"];
    const f = evaluateAlerts({
      ...base,
      campaignReach: days.map((date) => ({ campaignId: "1", date, impressions: 100, impressionShare: 0.6, lostBudgetShare: 0.35, lostRankShare: 0.05 })),
    });
    const a = f.find((x) => x.type === "budget_limited");
    expect(a?.message).toContain("35%");
    expect(a?.key).toBe("1");
  });
});

describe("script", () => {
  it("inclui as consultas novas e protege cada uma para não derrubar o envio principal", () => {
    const s = buildAdsScript({ endpoint: "https://x/api/ingest", key: "ps_x", clientName: "C" });
    for (const q of ["search_term_view", "keyword_view", "conversion_action", "search_budget_lost_impression_share"]) expect(s).toContain(q);
    expect(s).toContain("try {");
    // O script precisa ser JavaScript válido.
    expect(() => new Function(s)).not.toThrow();
  });
});
