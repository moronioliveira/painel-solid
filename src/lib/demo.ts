/**
 * Dados fictícios da demonstração pública. Tudo é gerado na hora, sem banco:
 * ninguém consegue alterar nada nem chegar a dados reais por aqui.
 */
import { reachSentence, searchTermSummary, topTermsSentence, weightedReach, type ReachRow } from "./ads-extras";
import { addMonths, eachDay, monthEnd } from "./dates";
import { sumTotals, type CampaignTotals, type DayTotals } from "./metrics";
import { summarize, type MonthlyReport } from "./report";
import { businessItems, resultSummary, type BusinessItem } from "./results";

export const DEMO_CLIENT_NAME = "Escritório Exemplo de Advocacia";

/** Gerador pseudoaleatório com semente: o mesmo mês sempre dá os mesmos números. */
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const CAMPAIGNS = [
  { id: "demo-1", name: "Pesquisa | Direito trabalhista", cost: [24, 32], cpc: [2.6, 3.4], ctr: [0.06, 0.09], cvr: [0.1, 0.16] },
  { id: "demo-2", name: "Pesquisa | Nome do escritório", cost: [4, 7], cpc: [0.7, 1.1], ctr: [0.18, 0.26], cvr: [0.18, 0.26] },
] as const;

type DemoDay = DayTotals & { campaignId: string; campaignName: string };

function generateMonth(month: string, quality: number) {
  const rand = rng(`demo|${month}`);
  const between = ([a, b]: readonly [number, number]) => a + (b - a) * rand();
  const rows: DemoDay[] = [];
  for (const date of eachDay(`${month}-01`, monthEnd(month))) {
    for (const c of CAMPAIGNS) {
      const cost = Math.round(between(c.cost) * 100) / 100;
      const clicks = Math.max(1, Math.round(cost / between(c.cpc)));
      const impressions = Math.round(clicks / between(c.ctr));
      const conversions = Math.round(clicks * between(c.cvr) * quality);
      rows.push({ date, campaignId: c.id, campaignName: c.name, impressions, clicks, cost, conversions, conversionsValue: 0 });
    }
  }
  return rows;
}

function byDay(rows: DemoDay[]): DayTotals[] {
  const map = new Map<string, DayTotals>();
  for (const r of rows) {
    const d = map.get(r.date) ?? { date: r.date, impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionsValue: 0 };
    d.impressions += r.impressions;
    d.clicks += r.clicks;
    d.cost = Math.round((d.cost + r.cost) * 100) / 100;
    d.conversions += r.conversions;
    map.set(r.date, d);
  }
  return [...map.values()];
}

function byCampaign(rows: DemoDay[]): CampaignTotals[] {
  return CAMPAIGNS.map((c) => ({
    campaignId: c.id,
    campaignName: c.name,
    status: "ENABLED",
    ...sumTotals(rows.filter((r) => r.campaignId === c.id)),
  })).sort((a, b) => b.cost - a.cost);
}

export type DemoReport = {
  clientName: string;
  month: string;
  report: MonthlyReport;
  extraLines: string[];
  resultLine: string | null;
  bizItems: BusinessItem[];
};

/** Relatório fictício do último mês fechado antes de `today`. */
export function buildDemoReport(today: string): DemoReport {
  const month = addMonths(today.slice(0, 7), -1);
  const prevMonth = addMonths(month, -1);
  const rows = generateMonth(month, 1);
  const prevRows = generateMonth(prevMonth, 0.85); // mês anterior um pouco pior: mostra evolução
  const daily = byDay(rows);
  const totals = sumTotals(daily);
  const prevTotals = sumTotals(byDay(prevRows));
  const campaigns = byCampaign(rows);
  const budget = 1100;

  const report: MonthlyReport = {
    month,
    from: `${month}-01`,
    to: monthEnd(month),
    partial: false,
    totals,
    prevMonth,
    prevTotals,
    daily,
    campaigns,
    summary: summarize({ month, to: monthEnd(month), partial: false, totals, prevMonth, prevTotals, campaigns, budget }),
  };

  const reach: ReachRow[] = [{ impressions: totals.impressions, impressionShare: 0.64, lostBudgetShare: 0.22, lostRankShare: 0.14 }];
  const conv = totals.conversions;
  const terms = [
    { term: "advogado trabalhista", impressions: 900, clicks: 70, cost: 210, conversions: Math.round(conv * 0.3) },
    { term: "rescisão indireta", impressions: 500, clicks: 40, cost: 120, conversions: Math.round(conv * 0.2) },
    { term: "advogado para processar empresa", impressions: 400, clicks: 30, cost: 95, conversions: Math.round(conv * 0.12) },
  ];
  // Números modestos de propósito: a vitrine não pode soar como promessa de resultado.
  const deals = Math.max(1, Math.round(conv * 0.06));
  const result = { leads: Math.round(conv * 0.8), deals, revenue: deals * 1200 };

  return {
    clientName: DEMO_CLIENT_NAME,
    month,
    report,
    extraLines: [reachSentence(weightedReach(reach)), topTermsSentence(searchTermSummary(terms))].filter((x): x is string => !!x),
    resultLine: resultSummary(totals, result),
    bizItems: businessItems(totals, result),
  };
}
