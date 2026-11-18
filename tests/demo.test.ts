import { describe, expect, it } from "vitest";
import { buildDemoReport, DEMO_CLIENT_NAME } from "@/lib/demo";

describe("demonstração", () => {
  it("mostra o último mês fechado, com números estáveis e coerentes", () => {
    const a = buildDemoReport("2026-11-17");
    const b = buildDemoReport("2026-11-30");
    expect(a.month).toBe("2026-10");
    expect(a.report.daily).toHaveLength(31);
    expect(a.report.totals).toEqual(b.report.totals); // mesmo mês, mesmos números
    const t = a.report.totals;
    expect(t.conversions).toBeGreaterThan(0);
    expect(t.clicks).toBeLessThan(t.impressions);
    expect(t.cost).toBeGreaterThan(700);
    expect(t.cost).toBeLessThan(1300);
    expect(a.report.campaigns.reduce((s, c) => s + c.cost, 0)).toBeCloseTo(t.cost, 1);
  });

  it("vira o ano em janeiro", () => {
    expect(buildDemoReport("2027-01-05").month).toBe("2026-12");
  });

  it("tem resumo, alcance, buscas, resultado no negócio e mostra evolução", () => {
    const d = buildDemoReport("2026-11-17");
    expect(d.clientName).toBe(DEMO_CLIENT_NAME);
    expect(d.report.summary[0]).toContain("trouxeram");
    expect(d.report.summary.join(" ")).toContain("mais contatos");
    expect(d.reach?.share).toBeCloseTo(0.64, 2);
    expect(d.topTerms).toHaveLength(3);
    expect(d.result.deals).toBeGreaterThan(0);
    expect(d.result.leads).toBeGreaterThan(d.result.deals!);
  });
});
