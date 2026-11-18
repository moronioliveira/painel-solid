/** Cálculos e textos do relatório do cliente (a "carta do mês"). */
import { addDays, dayOfMonth } from "./dates";
import { brl, brl0, change, cpl, pct } from "./format";
import type { DayTotals, Totals } from "./metrics";

export type Week = { label: string; from: string; to: string; conversions: number; cost: number; clicks: number };

/** Blocos de 7 dias a partir do dia 1 do mês, até `to`. Semanas sem dados entram zeradas. */
export function weeklyTotals(daily: DayTotals[], from: string, to: string): Week[] {
  const weeks: Week[] = [];
  for (let start = from; start <= to; start = addDays(start, 7)) {
    const end = addDays(start, 6) < to ? addDays(start, 6) : to;
    const days = daily.filter((d) => d.date >= start && d.date <= end);
    weeks.push({
      label: `${dayOfMonth(start)} a ${dayOfMonth(end)}`,
      from: start,
      to: end,
      conversions: days.reduce((a, d) => a + d.conversions, 0),
      cost: Math.round(days.reduce((a, d) => a + d.cost, 0) * 100) / 100,
      clicks: days.reduce((a, d) => a + d.clicks, 0),
    });
  }
  return weeks;
}

/** Comparação com o mês anterior em uma frase. Null quando não há com o que comparar. */
export function comparison(t: Pick<Totals, "conversions" | "cost">, p: Pick<Totals, "conversions" | "cost">, prevName: string) {
  if (p.cost === 0 && p.conversions === 0) return null;
  if (p.conversions === 0) {
    return t.conversions > 0 ? { text: `Em ${prevName} nenhum contato tinha vindo pelos anúncios.`, better: true } : null;
  }
  const count = change(t.conversions, p.conversions) ?? 0;
  const nowCost = cpl(t.cost, t.conversions);
  const prevCost = cpl(p.cost, p.conversions);
  const cost = nowCost !== null && prevCost !== null ? change(nowCost, prevCost) : null;
  const same = (x: number) => Math.abs(x) < 0.005;
  if (same(count) && cost !== null && same(cost)) {
    return { text: `A mesma quantidade de contatos que em ${prevName}, pelo mesmo custo.`, better: true };
  }
  const countPart = same(count)
    ? `A mesma quantidade de contatos que em ${prevName}`
    : `${pct(Math.abs(count), 0)} ${count > 0 ? "mais" : "menos"} contatos que em ${prevName}`;
  let costPart = "";
  if (cost !== null) {
    costPart = same(cost) ? ", pelo mesmo custo" : `, e cada um saiu ${pct(Math.abs(cost), 0)} ${cost > 0 ? "mais caro" : "mais barato"}`;
  }
  const better = count > 0 || (same(count) && cost !== null && cost < 0);
  return { text: `${countPart}${costPart}.`, better };
}

/** Tira o prefixo de tipo de campanha ("Pesquisa | ", "Search - ") que só faz sentido para o gestor. */
export function cleanCampaignName(name: string): string {
  const cleaned = name.replace(/^\s*(pesquisa|search|rede de pesquisa|display|pmax|performance max)\s*[|\-–—:]\s*/i, "").trim();
  return cleaned || name;
}

/** Dinheiro para leigo: sem centavos a partir de R$ 10. */
export function moneyShort(n: number): string {
  return Math.abs(n) >= 10 ? brl0(n) : brl(n);
}
