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

const direction = (delta: number, up: string, down: string) => (delta > 0 ? up : down);

/** Resumo em linguagem simples, para o cliente final ler. */
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
    return [`Não há dados de anúncios registrados em ${monthLabel(r.month)}.`];
  }
  const out: string[] = [];
  const when = r.partial ? `Em ${monthLabel(r.month)}, até ${fullDate(r.to)},` : `Em ${monthLabel(r.month)}`;
  const costPer = cpl(t.cost, t.conversions);

  if (costPer !== null) {
    out.push(
      `${when} foram investidos ${brl(t.cost)} em anúncios, que geraram ${conv(t.conversions)} ${t.conversions === 1 ? "conversão" : "conversões"} a um custo médio de ${brl(costPer)} cada.`,
    );
  } else {
    out.push(`${when} foram investidos ${brl(t.cost)} em anúncios, ainda sem conversões registradas no período.`);
  }

  if (t.impressions > 0) {
    out.push(
      `Os anúncios apareceram ${int(t.impressions)} vezes e receberam ${int(t.clicks)} ${t.clicks === 1 ? "clique" : "cliques"}: de cada 100 pessoas que viram, ${(t.clicks / t.impressions * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} clicaram.`,
    );
  }

  const prevName = r.partial ? `os mesmos dias de ${monthName(r.prevMonth)}` : monthName(r.prevMonth);
  const convChange = change(t.conversions, p.conversions);
  if (p.cost === 0 && p.conversions === 0) {
    // primeiro mês com dados: nada para comparar
  } else if (convChange === null) {
    if (t.conversions > 0) out.push(`Comparando com ${prevName}, que não teve conversões, o resultado melhorou.`);
  } else {
    const parts: string[] = [];
    parts.push(
      Math.abs(convChange) < 0.005
        ? "o número de conversões ficou igual"
        : `as conversões ${direction(convChange, "aumentaram", "caíram")} ${pct(Math.abs(convChange), 0)}`,
    );
    const prevCostPer = cpl(p.cost, p.conversions);
    if (costPer !== null && prevCostPer !== null) {
      const c = change(costPer, prevCostPer)!;
      parts.push(
        Math.abs(c) < 0.005
          ? "o custo por conversão ficou igual"
          : `o custo por conversão ficou ${pct(Math.abs(c), 0)} ${direction(c, "maior", "menor")}`,
      );
    }
    out.push(`Comparando com ${prevName}, ${parts.join(" e ")}.`);
  }

  const best = [...r.campaigns].filter((c) => c.conversions > 0).sort((a, b) => b.conversions - a.conversions)[0];
  if (best && r.campaigns.length > 1) {
    out.push(
      `A campanha com mais resultado foi "${best.campaignName}", com ${conv(best.conversions)} ${best.conversions === 1 ? "conversão" : "conversões"} a ${brl(best.cost / best.conversions)} cada.`,
    );
  }

  if (r.budget && r.budget > 0 && !r.partial) {
    out.push(`O investimento ficou em ${pct(t.cost / r.budget, 0)} da verba combinada de ${brl(r.budget)}.`);
  }
  return out;
}
