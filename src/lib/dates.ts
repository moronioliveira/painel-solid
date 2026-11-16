/** Datas são sempre strings ISO "AAAA-MM-DD" (dia da conta de anúncios), sem fuso. */

export function todayInTz(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / 86_400_000);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(isoOrMonth: string): string {
  return `${isoOrMonth.slice(0, 7)}-01`;
}

export function daysInMonth(isoOrMonth: string): number {
  const [y, m] = isoOrMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthEnd(isoOrMonth: string): string {
  return `${isoOrMonth.slice(0, 7)}-${String(daysInMonth(isoOrMonth)).padStart(2, "0")}`;
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUtc(toUtc(s)) === s;
}

export function isMonthKey(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

/** Lista todos os dias de `from` a `to`, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
