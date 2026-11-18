import { describe, expect, it } from "vitest";
import { accessState, reportIsOpen } from "@/lib/access";
import { inviteMatches } from "@/lib/auth/login";
import { dailyToMonthly } from "@/lib/budget";

const base = { active: true, accessSuspended: false, paidUntil: null as string | null, graceDays: 5 };

describe("acesso ao link do relatório", () => {
  it("sem vencimento fica aberto", () => {
    expect(accessState(base, "2026-11-17")).toEqual({ kind: "open" });
  });
  it("avisa nos 5 dias antes de vencer, inclusive no dia", () => {
    const c = { ...base, paidUntil: "2026-11-20" };
    expect(accessState(c, "2026-11-14")).toEqual({ kind: "open" });
    expect(accessState(c, "2026-11-15")).toEqual({ kind: "due_soon", daysLeft: 5 });
    expect(accessState(c, "2026-11-20")).toEqual({ kind: "due_soon", daysLeft: 0 });
  });
  it("depois de vencer, abre durante a tolerância e bloqueia no dia seguinte", () => {
    const c = { ...base, paidUntil: "2026-11-20", graceDays: 3 };
    expect(accessState(c, "2026-11-23")).toEqual({ kind: "grace", blocksOn: "2026-11-24" });
    expect(reportIsOpen(c, "2026-11-23")).toBe(true);
    expect(accessState(c, "2026-11-24")).toEqual({ kind: "expired", since: "2026-11-24" });
    expect(reportIsOpen(c, "2026-11-24")).toBe(false);
  });
  it("tolerância zero bloqueia no dia seguinte ao vencimento", () => {
    const c = { ...base, paidUntil: "2026-11-30", graceDays: 0 };
    expect(reportIsOpen(c, "2026-11-30")).toBe(true);
    expect(reportIsOpen(c, "2026-12-01")).toBe(false);
  });
  it("suspenso ou arquivado bloqueia mesmo com pagamento em dia", () => {
    const pago = { ...base, paidUntil: "2027-01-31" };
    expect(reportIsOpen({ ...pago, accessSuspended: true }, "2026-11-17")).toBe(false);
    expect(reportIsOpen({ ...pago, active: false }, "2026-11-17")).toBe(false);
  });
});

describe("código de convite", () => {
  it("sem código configurado o cadastro fica fechado", () => {
    expect(inviteMatches("qualquer", undefined)).toBe(false);
    expect(inviteMatches("", "")).toBe(false);
  });
  it("aceita só o código exato, ignorando espaços nas pontas", () => {
    expect(inviteMatches(" ABC-123 ", "ABC-123")).toBe(true);
    expect(inviteMatches("abc-123", "ABC-123")).toBe(false);
    expect(inviteMatches("ABC-12", "ABC-123")).toBe(false);
  });
});

describe("verba diária", () => {
  it("converte pela média de dias do mês do Google Ads (30,4)", () => {
    expect(dailyToMonthly(30)).toBe(912);
    expect(dailyToMonthly(17.5)).toBe(532);
  });
});

describe("renovar um mês", () => {
  it("mantém o dia e ajusta no fim do mês", async () => {
    const { addMonthsClamped } = await import("@/lib/access");
    expect(addMonthsClamped("2026-11-17", 1)).toBe("2026-12-17");
    expect(addMonthsClamped("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonthsClamped("2026-12-10", 1)).toBe("2027-01-10");
  });
});
