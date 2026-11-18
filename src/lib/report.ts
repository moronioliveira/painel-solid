import type { Db } from "@/db";
import type { Client } from "@/db/schema";
import { addDays, addMonths, dayOfMonth, daysInMonth, monthEnd, monthKey } from "./dates";
import { brl, change, conv, cpl, fullDate, int, monthLabel, monthName, pct } from "./format";
import { campaignTotals, dailyTotals, sumTotals, type CampaignTotals, type DayTotals, type Totals } from "./metrics";

export type MonthlyReport = {
  month: string;
  from: string;
  to: string;
  /** Mês ainda em andamento: os números vão até `to`. */
  partial: boolean;
  totals: Totals;
  prevMonth: string;
  prevTotals: Totals;
  daily: DayTotals[];
  campaigns: CampaignTotals[];
  summary: string[];
};

/** Relatório de um mês. Devolve null para mês futuro. */
export async function buildMonthlyReport(
  db: Db,
  client: Pick<Client, "id" | "monthlyBudget">,
  month: string,
  today: string,
): Promise<MonthlyReport | null> {
  const current = monthKey(today);
  if (month > current) return null;
  const partial = month === current;
  const from = `${month}-01`;
  const yesterday = addDays(today, -1);
  const to = partial ? (yesterday < from ? from : yesterday) : monthEnd(month);

  const prevMonth = addMonths(month, -1);
  // Mês em andamento compara com os mesmos dias do mês anterior.
  const prevTo = partial
    ? `${prevMonth}-${String(Math.min(dayOfMonth(to), daysInMonth(prevMonth))).padStart(2, "0")}`
    : monthEnd(prevMonth);

  const [daily, campaigns, prevDaily] = await Promise.all([
    dailyTotals(db, client.id, from, to),
    campaignTotals(db, client.id, from, to),
    dailyTotals(db, client.id, `${prevMonth}-01`, prevTo),
  ]);
  const totals = sumTotals(daily);
  const prevTotals = sumTotals(prevDaily);

  return {
    month,
    from,
    to,
    partial,
    totals,
    prevMonth,
    prevTotals,
    daily,
    campaigns,
    summary: summarize({ month, to, partial, totals, prevMonth, prevTotals, campaigns, budget: client.monthlyBudget }),
  };
}

const contatos = (n: number) => `${conv(n)} ${n === 1 ? "contato" : "contatos"}`;

/** Resumo em linguagem simples, para o cliente final ler. Sem termos técnicos do Google Ads. */
export function summarize(r: {
  month: string;
  to: string;
  partial: boolean;
  totals: Totals;
  prevMonth: string;
  prevTotals: Totals;
  campaigns: Pick<CampaignTotals, "campaignName" | "cost" | "conversions">[];
  budget: number | null;
}): string[] {
  const { totals: t, prevTotals: p } = r;
  if (t.cost === 0 && t.impressions === 0) {
    return [`Não houve anúncios no ar em ${monthLabel(r.month)}.`];
  }
  const out: string[] = [];
  const when = r.partial ? `Em ${monthLabel(r.month)}, até ${fullDate(r.to)},` : `Em ${monthLabel(r.month)}`;
  const costPer = cpl(t.cost, t.conversions);

  if (costPer !== null) {
    const each = t.conversions === 1 ? `Esse contato custou ${brl(costPer)}.` : `Em média, cada contato custou ${brl(costPer)}.`;
    out.push(`${when} foram investidos ${brl(t.cost)} em anúncios no Google, que trouxeram ${contatos(t.conversions)}. ${each}`);
  } else {
    out.push(`${when} foram investidos ${brl(t.cost)} em anúncios no Google, mas ainda nenhum contato veio pelos anúncios nesse período.`);
  }

  if (t.impressions > 0) {
    const share = (t.clicks / t.impressions) * 100;
    out.push(
      `Os anúncios apareceram ${int(t.impressions)} vezes nas buscas e levaram ${int(t.clicks)} ${t.clicks === 1 ? "pessoa" : "pessoas"} ao seu site: de cada 100 pessoas que viram o anúncio, ${share.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} entraram.`,
    );
  }

  const prevName = r.partial ? `os mesmos dias de ${monthName(r.prevMonth)}` : monthName(r.prevMonth);
  const convChange = change(t.conversions, p.conversions);
  if (p.cost === 0 && p.conversions === 0) {
    // primeiro mês com dados: nada para comparar
  } else if (convChange === null) {
    if (t.conversions > 0) out.push(`Em ${prevName} nenhum contato tinha vindo pelos anúncios, então o resultado melhorou.`);
  } else {
    const same = (x: number) => Math.abs(x) < 0.005;
    const prevCostPer = cpl(p.cost, p.conversions);
    const costChange = costPer !== null && prevCostPer !== null ? change(costPer, prevCostPer) : null;
    const countPart = same(convChange)
      ? "a quantidade de contatos ficou igual"
      : `vieram ${pct(Math.abs(convChange), 0)} ${convChange > 0 ? "mais" : "menos"} contatos`;
    let costPart = "";
    if (costChange !== null) {
      if (same(costChange)) costPart = same(convChange) ? " e o custo de cada contato também" : " e o custo de cada contato ficou igual";
      else costPart = ` e cada contato saiu ${pct(Math.abs(costChange), 0)} ${costChange > 0 ? "mais caro" : "mais barato"}`;
    }
    out.push(`Comparado com ${prevName}, ${countPart}${costPart}.`);
  }

  const best = [...r.campaigns].filter((c) => c.conversions > 0).sort((a, b) => b.conversions - a.conversions)[0];
  if (best && r.campaigns.length > 1) {
    out.push(`A campanha que mais trouxe contatos foi "${best.campaignName}": ${contatos(best.conversions)}, a ${brl(best.cost / best.conversions)}${best.conversions === 1 ? "" : " cada"}.`);
  }

  if (r.budget && r.budget > 0 && !r.partial) {
    out.push(`O investimento usou ${pct(t.cost / r.budget, 0)} da verba combinada para o mês, de ${brl(r.budget)}.`);
  }
  return out;
}
