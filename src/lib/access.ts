import type { Client } from "@/db/schema";
import { addDays, addMonths, daysInMonth, diffDays } from "./dates";

/** Quantos dias antes do vencimento o painel começa a avisar. */
export const DUE_SOON_DAYS = 5;

type AccessFields = Pick<Client, "active" | "accessSuspended" | "paidUntil" | "graceDays">;

export type AccessState =
  | { kind: "open" } // sem vencimento ou longe dele
  | { kind: "due_soon"; daysLeft: number } // vence em até DUE_SOON_DAYS dias (0 = vence hoje)
  | { kind: "grace"; blocksOn: string } // venceu, mas ainda dentro da tolerância
  | { kind: "expired"; since: string } // venceu e passou da tolerância: link bloqueado
  | { kind: "suspended" }
  | { kind: "archived" };

export function accessState(c: AccessFields, today: string): AccessState {
  if (!c.active) return { kind: "archived" };
  if (c.accessSuspended) return { kind: "suspended" };
  if (!c.paidUntil) return { kind: "open" };
  const daysLeft = diffDays(c.paidUntil, today);
  if (daysLeft >= 0) return daysLeft <= DUE_SOON_DAYS ? { kind: "due_soon", daysLeft } : { kind: "open" };
  // O link fica aberto até o último dia de tolerância, inclusive.
  const lastOpenDay = addDays(c.paidUntil, c.graceDays);
  if (today <= lastOpenDay) return { kind: "grace", blocksOn: addDays(lastOpenDay, 1) };
  return { kind: "expired", since: addDays(lastOpenDay, 1) };
}

/** O link do relatório só abre nestes estados. */
export function reportIsOpen(c: AccessFields, today: string): boolean {
  const k = accessState(c, today).kind;
  return k === "open" || k === "due_soon" || k === "grace";
}

/** Mesmo dia N meses depois; 31/01 + 1 mês = 28 ou 29/02. */
export function addMonthsClamped(iso: string, n: number): string {
  const target = addMonths(iso.slice(0, 7), n);
  const day = Math.min(Number(iso.slice(8, 10)), daysInMonth(target));
  return `${target}-${String(day).padStart(2, "0")}`;
}

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dias = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);

/** Frase curta para as telas do painel. `tone` decide a cor. */
export function accessLabel(s: AccessState): { text: string; tone: "ok" | "warning" | "critical" | "muted" } {
  switch (s.kind) {
    case "open":
      return { text: "Link liberado", tone: "ok" };
    case "due_soon":
      return { text: s.daysLeft === 0 ? "Vence hoje" : `Vence em ${dias(s.daysLeft)}`, tone: "warning" };
    case "grace":
      return { text: `Vencido. O link bloqueia em ${br(s.blocksOn)}`, tone: "warning" };
    case "expired":
      return { text: `Link bloqueado por vencimento desde ${br(s.since)}`, tone: "critical" };
    case "suspended":
      return { text: "Link suspenso por você", tone: "critical" };
    case "archived":
      return { text: "Link bloqueado: cliente arquivado", tone: "muted" };
  }
}
