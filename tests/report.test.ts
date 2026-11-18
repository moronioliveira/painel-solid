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
    expect(s[0]).toBe("Em outubro de 2026 foram investidos R$ 1.000,00 em anúncios no Google, que trouxeram 25 contatos. Em média, cada contato custou R$ 40,00.");
    expect(s[1]).toContain("10.000 vezes");
    expect(s[1]).toContain("levaram 400 pessoas ao seu site");
    expect(s[2]).toBe("Comparado com setembro, vieram 25% mais contatos e cada contato saiu 20% mais barato.");
    expect(s[3]).toBe("O investimento usou 83% da verba combinada para o mês, de R$ 1.200,00.");
  });

  it("queda e custo maior", () => {
    const s = summarize({ ...base, totals: t(1000, 10), prevTotals: t(1000, 20) });
    expect(s[2]).toBe("Comparado com setembro, vieram 50% menos contatos e cada contato saiu 100% mais caro.");
  });

  it("mês em andamento diz até que dia e compara os mesmos dias", () => {
    const s = summarize({ ...base, month: "2026-11", to: "2026-11-15", partial: true, prevMonth: "2026-10", totals: t(500, 10), prevTotals: t(500, 10), budget: 1000 });
    expect(s[0]).toContain("Em novembro de 2026, até 15/11/2026, foram investidos");
    expect(s[2]).toBe("Comparado com os mesmos dias de outubro, a quantidade de contatos ficou igual e o custo de cada contato também.");
    expect(s.join(" ")).not.toContain("verba"); // mês parcial não fala de % da verba
  });

  it("primeiro mês não inventa comparação; sem conversão não divide por zero", () => {
    const s = summarize({ ...base, totals: t(300, 0), prevTotals: { ...ZERO } });
    expect(s[0]).toContain("nenhum contato veio pelos anúncios");
    expect(s).toHaveLength(2);
    expect(s.join(" ")).not.toMatch(/NaN|Infinity/);
  });

  it("mês anterior sem conversão", () => {
    const s = summarize({ ...base, totals: t(300, 4), prevTotals: t(200, 0) });
    expect(s[2]).toBe("Em setembro nenhum contato tinha vindo pelos anúncios, então o resultado melhorou.");
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
    expect(s[0]).toContain("trouxeram 1 contato. Esse contato custou R$ 100,00.");
    expect(s[1]).toContain("levaram 1 pessoa ao seu site");
    expect(s[2]).toBe('A campanha que mais trouxe contatos foi "Pesquisa FGTS": 1 contato, a R$ 80,00.');
  });

  it("mês sem dados", () => {
    expect(summarize({ ...base, totals: { ...ZERO }, prevTotals: t(1, 1) })).toEqual(["Não houve anúncios no ar em outubro de 2026."]);
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
