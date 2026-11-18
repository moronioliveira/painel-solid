/** Cálculos sobre os dados extras do script: alcance (parcela de impressões) e termos de pesquisa. */

export type ReachRow = { impressions: number; impressionShare: number | null; lostBudgetShare: number | null; lostRankShare: number | null };
export type Reach = { share: number; lostBudget: number; lostRank: number };

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Junta vários dias/campanhas. Cada linha pesa pelas buscas em que o anúncio poderia aparecer
 * (impressões ÷ parcela), que é como o próprio Google soma.
 */
export function weightedReach(rows: ReachRow[]): Reach | null {
  let eligible = 0;
  let shown = 0;
  let budget = 0;
  let rank = 0;
  for (const r of rows) {
    if (r.impressionShare == null || r.impressionShare <= 0 || r.impressions <= 0) continue;
    const e = r.impressions / r.impressionShare;
    eligible += e;
    shown += r.impressions;
    budget += e * (r.lostBudgetShare ?? 0);
    rank += e * (r.lostRankShare ?? 0);
  }
  if (eligible === 0) return null;
  return { share: r4(shown / eligible), lostBudget: r4(budget / eligible), lostRank: r4(rank / eligible) };
}

export function reachByCampaign(rows: (ReachRow & { campaignId: string })[]): Map<string, Reach> {
  const groups = new Map<string, ReachRow[]>();
  for (const r of rows) groups.set(r.campaignId, [...(groups.get(r.campaignId) ?? []), r]);
  const out = new Map<string, Reach>();
  for (const [id, list] of groups) {
    const reach = weightedReach(list);
    if (reach) out.set(id, reach);
  }
  return out;
}

const pct0 = (n: number) => `${Math.round(n * 100)}%`;

/** A partir desta perda por verba, o relatório do cliente menciona. */
export const LOST_BUDGET_MENTION = 0.15;

/** Frase para o relatório do cliente. */
export function reachSentence(reach: Reach | null): string | null {
  if (!reach) return null;
  let s = `Os anúncios apareceram em ${pct0(reach.share)} das buscas em que poderiam aparecer.`;
  if (reach.lostBudget >= LOST_BUDGET_MENTION) {
    s += ` Em ${pct0(reach.lostBudget)} delas não apareceram porque a verba do dia já tinha acabado.`;
  }
  return s;
}

export type TermRow = { term: string; impressions: number; clicks: number; cost: number; conversions: number };
export type TermSummary = TermRow & { wasted: boolean };

/** Gasto mínimo sem nenhum contato para marcar o termo como candidato a negativa. */
export const WASTE_MIN_COST = 10;

/** Soma por termo (sem diferenciar maiúsculas), ordena pelo gasto e marca o gasto sem contato. */
export function searchTermSummary(rows: TermRow[]): TermSummary[] {
  const map = new Map<string, TermRow>();
  for (const r of rows) {
    const id = r.term.trim().toLocaleLowerCase("pt-BR");
    const prev = map.get(id);
    if (!prev) map.set(id, { ...r, term: r.term.trim() });
    else {
      prev.impressions += r.impressions;
      prev.clicks += r.clicks;
      prev.cost += r.cost;
      prev.conversions += r.conversions;
    }
  }
  return [...map.values()]
    .map((t) => ({ ...t, cost: Math.round(t.cost * 100) / 100, wasted: t.conversions === 0 && t.cost >= WASTE_MIN_COST }))
    .sort((a, b) => b.cost - a.cost || b.clicks - a.clicks);
}

/** Até `n` buscas que mais trouxeram contatos, da melhor para a pior. */
export function topTerms(terms: TermSummary[], n = 3): string[] {
  return terms
    .filter((t) => t.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions || b.cost - a.cost)
    .slice(0, n)
    .map((t) => t.term);
}

/** Frase para o relatório do cliente com até 3 buscas que trouxeram contatos. */
export function topTermsSentence(terms: TermSummary[]): string | null {
  const top = topTerms(terms).map((t) => `"${t}"`);
  if (top.length === 0) return null;
  if (top.length === 1) return `A busca que mais trouxe contatos foi ${top[0]}.`;
  const list = top.length === 2 ? top.join(" e ") : `${top[0]}, ${top[1]} e ${top[2]}`;
  return `As buscas que mais trouxeram contatos foram ${list}.`;
}
