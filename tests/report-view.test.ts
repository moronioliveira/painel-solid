import { describe, expect, it } from "vitest";
import { topTerms, searchTermSummary } from "@/lib/ads-extras";
import { ZERO } from "@/lib/metrics";
import { cleanCampaignName, comparison, moneyShort, weeklyTotals } from "@/lib/report-view";

const day = (date: string, conversions: number, cost = 10) => ({ ...ZERO, date, conversions, cost, clicks: 3 });
const plain = (s: string) => s.replace(/ /g, " ");

describe("semanas do mês", () => {
  it("agrupa em blocos de 7 dias a partir do dia 1, com a última semana menor", () => {
    const daily = Array.from({ length: 31 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, "0")}`, 1));
    const w = weeklyTotals(daily, "2026-10-01", "2026-10-31");
    expect(w.map((x) => x.label)).toEqual(["1 a 7", "8 a 14", "15 a 21", "22 a 28", "29 a 31"]);
    expect(w.map((x) => x.conversions)).toEqual([7, 7, 7, 7, 3]);
    expect(w[0].cost).toBe(70);
  });
  it("mês em andamento para no último dia com dados e inclui semanas sem nenhum dia", () => {
    const w = weeklyTotals([day("2026-11-03", 2)], "2026-11-01", "2026-11-10");
    expect(w.map((x) => [x.label, x.conversions])).toEqual([["1 a 7", 2], ["8 a 10", 0]]);
  });
});

describe("comparação com o mês anterior", () => {
  it("fala de quantidade e de custo em palavras simples", () => {
    const c = comparison({ ...ZERO, conversions: 75, cost: 1000 }, { ...ZERO, conversions: 62, cost: 1000 }, "setembro");
    expect(c).toEqual({ text: "21% mais contatos que em setembro, e cada um saiu 17% mais barato.", better: true });
  });
  it("piora", () => {
    const c = comparison({ ...ZERO, conversions: 10, cost: 1000 }, { ...ZERO, conversions: 20, cost: 1000 }, "setembro");
    expect(c).toEqual({ text: "50% menos contatos que em setembro, e cada um saiu 100% mais caro.", better: false });
  });
  it("sem mês anterior não inventa comparação", () => {
    expect(comparison({ ...ZERO, conversions: 5, cost: 100 }, { ...ZERO }, "setembro")).toBeNull();
  });
  it("mês anterior sem contatos", () => {
    expect(comparison({ ...ZERO, conversions: 5, cost: 100 }, { ...ZERO, cost: 80 }, "setembro")).toEqual({
      text: "Em setembro nenhum contato tinha vindo pelos anúncios.",
      better: true,
    });
  });
  it("igual", () => {
    expect(comparison({ ...ZERO, conversions: 10, cost: 100 }, { ...ZERO, conversions: 10, cost: 100 }, "setembro")?.text).toBe(
      "A mesma quantidade de contatos que em setembro, pelo mesmo custo.",
    );
  });
});

describe("textos", () => {
  it("tira o prefixo técnico do nome da campanha", () => {
    expect(cleanCampaignName("Pesquisa | Direito trabalhista")).toBe("Direito trabalhista");
    expect(cleanCampaignName("Search - Marca")).toBe("Marca");
    expect(cleanCampaignName("Pesquisa")).toBe("Pesquisa");
    expect(cleanCampaignName("Rescisão indireta")).toBe("Rescisão indireta");
  });
  it("valores grandes sem centavos, pequenos com centavos", () => {
    expect(plain(moneyShort(1005.27))).toBe("R$ 1.005");
    expect(plain(moneyShort(13.4))).toBe("R$ 13");
    expect(plain(moneyShort(4.0))).toBe("R$ 4,00");
  });
  it("lista as buscas que mais trouxeram contatos", () => {
    const t = searchTermSummary([
      { term: "a", impressions: 1, clicks: 1, cost: 5, conversions: 1 },
      { term: "b", impressions: 1, clicks: 1, cost: 9, conversions: 3 },
      { term: "c", impressions: 1, clicks: 1, cost: 20, conversions: 0 },
    ]);
    expect(topTerms(t)).toEqual(["b", "a"]);
  });
});
