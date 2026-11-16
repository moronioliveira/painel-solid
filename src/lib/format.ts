const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl0Fmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export const brl = (n: number) => brlFmt.format(n);
export const brl0 = (n: number) => brl0Fmt.format(n);
export const int = (n: number) => intFmt.format(n);
/** Conversões podem ser fracionadas (1,5). Mostra uma casa só quando precisa. */
export const conv = (n: number) => decFmt.format(n);
export const pct = (ratio: number, digits = 1) =>
  `${(ratio * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;

/** "2026-11-16" -> "16/11" */
export const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "2026-11-16" -> "16/11/2026" */
export const fullDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** "2026-11" -> "novembro de 2026" */
export const monthLabel = (month: string) =>
  `${MONTHS[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`;
export const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1];

export function dateTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(d)
    .replace(",", " às");
}

/** Custo por conversão; null quando não houve conversão. */
export const cpl = (cost: number, conversions: number) =>
  conversions > 0 ? cost / conversions : null;

/** Variação relativa (0.2 = +20%); null quando não dá para comparar. */
export const change = (current: number, previous: number) =>
  previous > 0 ? (current - previous) / previous : null;
