import { addDays, addMonths, dayOfMonth, daysInMonth, diffDays, monthEnd, monthKey, monthStart } from "./dates";
import { monthName } from "./format";

export type PeriodKey = "mes" | "mes-passado" | "7d" | "30d" | "90d";

export type Period = {
  key: PeriodKey;
  label: string;
  from: string;
  to: string;
  /** Período de comparação, do mesmo tamanho. */
  prevFrom: string;
  prevTo: string;
  prevLabel: string;
};

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "mes", label: "Este mês" },
  { key: "mes-passado", label: "Mês passado" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
];

export const isPeriodKey = (s: unknown): s is PeriodKey => PERIOD_OPTIONS.some((p) => p.key === s);

const pad = (n: number) => String(n).padStart(2, "0");

/** Períodos terminam ontem: o dia de hoje ainda está incompleto. */
export function resolvePeriod(key: PeriodKey, today: string): Period {
  const yesterday = addDays(today, -1);
  if (key === "mes") {
    const month = monthKey(today);
    const from = monthStart(today);
    const to = yesterday < from ? from : yesterday;
    const prev = addMonths(month, -1);
    // mesmos dias do mês anterior (dia 1 ao dia N), limitado ao tamanho daquele mês
    const day = Math.min(dayOfMonth(to), daysInMonth(prev));
    return {
      key,
      label: "Este mês",
      from,
      to,
      prevFrom: `${prev}-01`,
      prevTo: `${prev}-${pad(day)}`,
      prevLabel: `mesmos dias de ${monthName(prev)}`,
    };
  }
  if (key === "mes-passado") {
    const month = addMonths(monthKey(today), -1);
    const prev = addMonths(month, -1);
    return {
      key,
      label: "Mês passado",
      from: `${month}-01`,
      to: monthEnd(month),
      prevFrom: `${prev}-01`,
      prevTo: monthEnd(prev),
      prevLabel: monthName(prev),
    };
  }
  const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;
  const from = addDays(yesterday, -(days - 1));
  return {
    key,
    label: `Últimos ${days} dias`,
    from,
    to: yesterday,
    prevFrom: addDays(from, -days),
    prevTo: addDays(from, -1),
    prevLabel: `${days} dias anteriores`,
  };
}

export const periodLength = (p: Pick<Period, "from" | "to">) => diffDays(p.to, p.from) + 1;
