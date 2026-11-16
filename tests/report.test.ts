import { describe, expect, it } from "vitest";
import { resolvePeriod } from "@/lib/periods";
import { summarize as rawSummarize } from "@/lib/report";
import { ZERO } from "@/lib/metrics";

// Intl usa espaço não separável em "R$ 1,00"; os testes comparam com espaço comum.
const summarize = (r: Parameters<typeof rawSummarize>[0]) => rawSummarize(r).map((x) => x.replace(/\u00a0/g, " "));

const base = {
  month: "2026-10",
  to: "2026-10-31",
  partial: false,
  prevMonth: "2026-09",
  budget: null,
  campaigns: [],
};
const t = (cost: number, conversions: number, impressions = 10_000, clicks = 400) => ({ ...ZERO, cost, conversions, impressions, clicks });

describe("resumo do relatório", () => {
  it("mês fechado com comparação", () => {
    const s = summarize({ ...base, totals: t(1000, 25), prevTotals: t(1000, 20), budget: 1200 });
    expect(s[0]).toBe("Em outubro de 2026 foram investidos R$ 1.000,00 em anúncios, que geraram 25 conversões a um custo médio de R$ 40,00 cada.");
    expect(s[1]).toContain("10.000 vezes");
    expect(s[1]).toContain("400 cliques");
    expect(s[2]).toBe("Comparando com setembro, as conversões aumentaram 25% e o custo por conversão ficou 20% menor.");
    expect(s[3]).toBe("O investimento ficou em 83% da verba combinada de R$ 1.200,00.");
  });

  it("queda e custo maior", () => {
    const s = summarize({ ...base, totals: t(1000, 10), prevTotals: t(1000, 20) });
    expect(s[2]).toBe("Comparando com setembro, as conversões caíram 50% e o custo por conversão ficou 100% maior.");
  });

  it("mês em andamento diz até que dia e compara os mesmos dias", () => {
    const s = summarize({ ...base, month: "2026-11", to: "2026-11-15", partial: true, prevMonth: "2026-10", totals: t(500, 10), prevTotals: t(500, 10), budget: 1000 });
    expect(s[0]).toContain("Em novembro de 2026, até 15/11/2026, foram investidos");
    expect(s[2]).toBe("Comparando com os mesmos dias de outubro, o número de conversões ficou igual e o custo por conversão ficou igual.");
    expect(s.join(" ")).not.toContain("verba"); // mês parcial não fala de % da verba
  });

  it("primeiro mês não inventa comparação; sem conversão não divide por zero", () => {
    const s = summarize({ ...base, totals: t(300, 0), prevTotals: { ...ZERO } });
    expect(s[0]).toContain("ainda sem conversões");
    expect(s).toHaveLength(2);
    expect(s.join(" ")).not.toMatch(/NaN|Infinity/);
  });

  it("mês anterior sem conversão", () => {
    const s = summarize({ ...base, totals: t(300, 4), prevTotals: t(200, 0) });
    expect(s[2]).toBe("Comparando com setembro, que não teve conversões, o resultado melhorou.");
  });

  it("singular e campanha destaque", () => {
    const s = summarize({
      ...base,
      totals: t(100, 1, 50, 1),
      prevTotals: { ...ZERO },
      campaigns: [
        { campaignName: "Marca", cost: 20, conversions: 0 },
        { campaignName: "Pesquisa FGTS", cost: 80, conversions: 1 },
      ],
    });
    expect(s[0]).toContain("1 conversão a um custo");
    expect(s[1]).toContain("1 clique:");
    expect(s[2]).toBe('A campanha com mais resultado foi "Pesquisa FGTS", com 1 conversão a R$ 80,00 cada.');
  });

  it("mês sem dados", () => {
    expect(summarize({ ...base, totals: { ...ZERO }, prevTotals: t(1, 1) })).toEqual(["Não há dados de anúncios registrados em outubro de 2026."]);
  });
});

describe("períodos", () => {
  it("este mês vai até ontem e compara com os mesmos dias do mês anterior", () => {
    expect(resolvePeriod("mes", "2026-11-16")).toMatchObject({ from: "2026-11-01", to: "2026-11-15", prevFrom: "2026-10-01", prevTo: "2026-10-15" });
  });
  it("no dia 1 não volta para o mês anterior", () => {
    expect(resolvePeriod("mes", "2026-11-01")).toMatchObject({ from: "2026-11-01", to: "2026-11-01", prevTo: "2026-10-01" });
  });
  it("dia 31 de março compara com fevereiro inteiro", () => {
    expect(resolvePeriod("mes", "2026-04-01")).toMatchObject({ from: "2026-04-01" });
    expect(resolvePeriod("mes", "2026-03-31")).toMatchObject({ to: "2026-03-30", prevFrom: "2026-02-01", prevTo: "2026-02-28" });
  });
  it("mês passado e janelas móveis", () => {
    expect(resolvePeriod("mes-passado", "2026-01-10")).toMatchObject({ from: "2025-12-01", to: "2025-12-31", prevFrom: "2025-11-01", prevTo: "2025-11-30" });
    expect(resolvePeriod("7d", "2026-11-16")).toMatchObject({ from: "2026-11-09", to: "2026-11-15", prevFrom: "2026-11-02", prevTo: "2026-11-08" });
  });
});
