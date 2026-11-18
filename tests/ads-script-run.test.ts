import { describe, expect, it } from "vitest";
import { buildAdsScript } from "@/lib/ads-script";
import { ingestPayloadSchema } from "@/lib/ingest";

/** Roda o script com um Google Ads de mentira, no formato que o AdsApp.search devolve. */
function run(responses: Record<string, unknown[] | Error>) {
  const sent: { url: string; body: unknown }[] = [];
  const logs: string[] = [];
  const iter = (rows: unknown[]) => {
    let i = 0;
    return { hasNext: () => i < rows.length, next: () => rows[i++] };
  };
  const AdsApp = {
    currentAccount: () => ({ getTimeZone: () => "America/Sao_Paulo", getCustomerId: () => "123-456-7890" }),
    search: (q: string) => {
      // O trecho mais longo que bate é o mais específico.
      const key = Object.keys(responses).filter((k) => q.includes(k)).sort((a, b) => b.length - a.length)[0];
      if (!key) throw new Error("consulta inesperada: " + q);
      const r = responses[key];
      if (r instanceof Error) throw r;
      return iter(r);
    },
  };
  const UrlFetchApp = {
    fetch: (url: string, opts: { payload: string }) => {
      sent.push({ url, body: JSON.parse(opts.payload) });
      return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' };
    },
  };
  const Utilities = { formatDate: (d: Date) => d.toISOString().slice(0, 10) };
  const Logger = { log: (s: string) => logs.push(s) };
  const src = buildAdsScript({ endpoint: "https://painel/api/ingest", key: "ps_x", clientName: "C" });
  new Function("AdsApp", "UrlFetchApp", "Utilities", "Logger", src + "\nmain();")(AdsApp, UrlFetchApp, Utilities, Logger);
  return { sent, logs };
}

const today = new Date();
const d = (n: number) => new Date(today.getTime() - n * 86_400_000).toISOString().slice(0, 10);

const base = {
  "FROM campaign WHERE segments.date": [
    { campaign: { id: 11, name: "Pesquisa" }, segments: { date: d(2) }, metrics: { impressions: "100", clicks: "10", costMicros: "25000000", conversions: 2, conversionsValue: 0 } },
  ],
  "campaign.status FROM campaign": [{ campaign: { id: 11, name: "Pesquisa", status: "ENABLED" } }],
};

describe("script rodando contra um Google Ads simulado", () => {
  it("envia os dados extras e o painel aceita o envio", () => {
    const { sent, logs } = run({
      ...base,
      "metrics.search_impression_share": [
        { campaign: { id: 11 }, segments: { date: d(2) }, metrics: { searchImpressionShare: 0.62, searchBudgetLostImpressionShare: 0.25, searchRankLostImpressionShare: 0.13 } },
      ],
      search_term_view: [
        { searchTermView: { searchTerm: "advogado trabalhista" }, campaign: { id: 11 }, segments: { date: d(2) }, metrics: { impressions: "40", clicks: "4", costMicros: "9000000", conversions: 1 } },
      ],
      keyword_view: [
        {
          adGroup: { id: 5 },
          campaign: { name: "Pesquisa" },
          adGroupCriterion: { criterionId: 77, keyword: { text: "advogado trabalhista", matchType: "PHRASE" }, qualityInfo: { qualityScore: 6, creativeQualityScore: "AVERAGE", postClickQualityScore: "BELOW_AVERAGE", searchPredictedCtr: "ABOVE_AVERAGE" } },
          metrics: { impressions: "40", clicks: "4", costMicros: "9000000", conversions: 1 },
        },
        { adGroup: { id: 5 }, campaign: { name: "Pesquisa" }, adGroupCriterion: { criterionId: 78, keyword: { text: "fgts", matchType: "EXACT" } }, metrics: { impressions: "2", clicks: "0", costMicros: "0", conversions: 0 } },
      ],
      "FROM conversion_action": [
        { conversionAction: { id: 900, name: "Contato WhatsApp", status: "ENABLED", category: "CONTACT", primaryForGoal: true } },
        { conversionAction: { id: 901, name: "Antiga", status: "REMOVED", category: "DEFAULT", primaryForGoal: false } },
      ],
      "segments.conversion_action, segments.date, metrics.all_conversions": [
        { segments: { conversionAction: "customers/1/conversionActions/900", date: d(3) }, metrics: { allConversions: 2 } },
        { segments: { conversionAction: "customers/1/conversionActions/900", date: d(2) }, metrics: { allConversions: 1 } },
      ],
    });
    expect(sent).toHaveLength(1);
    const p = ingestPayloadSchema.parse(sent[0].body);
    expect(p.rows[0]).toMatchObject({ cost: 25, impressionShare: 0.62, lostBudgetShare: 0.25 });
    expect(p.searchTerms?.[0]).toMatchObject({ term: "advogado trabalhista", cost: 9 });
    expect(p.keywords?.find((k) => k.id === "5~77")).toMatchObject({ qualityScore: 6, landingPage: "BELOW_AVERAGE" });
    expect(p.keywords?.find((k) => k.id === "5~78")?.qualityScore).toBeNull();
    expect(p.conversionActions?.find((c) => c.id === "900")).toMatchObject({ primary: true, conversions30d: 3, lastConversionDate: d(2) });
    expect(p.extrasErrors).toEqual([]);
    expect(logs.some((l) => l.includes("Painel respondeu 200"))).toBe(true);
  });

  it("se uma consulta extra falhar, o envio principal sai sem esse campo", () => {
    const { sent, logs } = run({
      ...base,
      "metrics.search_impression_share": new Error("campo não suportado"),
      search_term_view: [],
      keyword_view: new Error("sem permissão"),
      "FROM conversion_action": [],
      "segments.conversion_action, segments.date, metrics.all_conversions": [],
    });
    const p = ingestPayloadSchema.parse(sent[0].body);
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].impressionShare).toBeUndefined();
    expect(p.keywords).toBeUndefined(); // não apaga as palavras-chave já gravadas
    expect(p.searchTerms).toEqual([]);
    expect(p.extrasErrors).toEqual(["alcance: campo não suportado", "palavras-chave: sem permissão"]);
    expect(logs.some((l) => l.startsWith("Aviso: palavras-chave"))).toBe(true);
  });
});
