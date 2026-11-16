import { describe, expect, it } from "vitest";
import { evaluateAlerts } from "@/lib/alerts/evaluate";
import type { AlertInput } from "@/lib/alerts/types";
import { addDays, eachDay } from "@/lib/dates";

const TODAY = "2026-11-16";
const NOW = new Date("2026-11-16T15:00:00Z");

function input(over: Partial<Omit<AlertInput, "client">> & { client?: Partial<AlertInput["client"]> } = {}): AlertInput {
  return {
    today: TODAY,
    now: NOW,
    timezone: "America/Sao_Paulo",
    daily: [],
    campaigns: [],
    campaignDaily: [],
    ...over,
    client: {
      monthlyBudget: null,
      targetCpl: null,
      lastIngestAt: new Date("2026-11-16T09:00:00Z"),
      lastIngestSource: "script",
      ...over.client,
    },
  };
}

/** Dias de `from` a `to` com o mesmo gasto e conversões. */
const days = (from: string, to: string, cost: number, conversions: number) =>
  eachDay(from, to).map((date) => ({ date, cost, conversions }));

const types = (i: AlertInput) => evaluateAlerts(i).map((f) => `${f.type}:${f.severity}`);

describe("verba", () => {
  it("não avisa quando o ritmo fecha perto da verba", () => {
    // 15 dias a R$ 30 = 450; projeção 900 para verba de 900
    expect(types(input({ client: { monthlyBudget: 900 }, daily: days("2026-11-01", "2026-11-15", 30, 1) }))).toEqual([]);
  });

  it("atenção quando a projeção passa de 110% e crítico acima de 125%", () => {
    const daily = days("2026-11-01", "2026-11-15", 30, 1); // projeção 900
    expect(types(input({ client: { monthlyBudget: 800 }, daily }))).toEqual(["budget_over:warning"]);
    expect(types(input({ client: { monthlyBudget: 700 }, daily }))).toEqual(["budget_over:critical"]);
  });

  it("diz em que dia a verba acaba", () => {
    const [f] = evaluateAlerts(input({ client: { monthlyBudget: 600 }, daily: days("2026-11-01", "2026-11-15", 30, 1) }));
    // gastou 450, faltam 150 a R$ 30/dia = 5 dias -> dia 20
    expect(f.message).toContain("por volta do dia 20");
  });

  it("crítico quando a verba já foi atingida", () => {
    const [f] = evaluateAlerts(input({ client: { monthlyBudget: 400 }, daily: days("2026-11-01", "2026-11-15", 30, 1) }));
    expect(f).toMatchObject({ type: "budget_over", severity: "critical" });
    expect(f.message).toContain("já foi atingida");
  });

  it("avisa que vai sobrar verba", () => {
    // projeção 900 para verba 1500 = 60%
    expect(types(input({ client: { monthlyBudget: 1500 }, daily: days("2026-11-01", "2026-11-15", 30, 1) }))).toEqual(["budget_under:warning"]);
  });

  it("campanha que começou no meio do mês usa o ritmo desde o primeiro gasto", () => {
    // começou dia 10: 6 dias a R$ 30 = 180; projeção = 180 + 30*15 = 630
    const daily = days("2026-11-10", "2026-11-15", 30, 1);
    expect(types(input({ client: { monthlyBudget: 600 }, daily }))).toEqual([]);
    // sem a correção a projeção seria 360 (60%) e daria "sobrando"
  });

  it("não projeta com menos de 3 dias de gasto nem conta o dia de hoje", () => {
    const daily = [...days("2026-11-14", "2026-11-15", 500, 1), { date: TODAY, cost: 9999, conversions: 0 }];
    expect(types(input({ client: { monthlyBudget: 5000 }, daily }))).toEqual([]);
  });

  it("no dia 1 não há dia completo no mês: sem alerta de verba", () => {
    const i = input({ today: "2026-12-01", client: { monthlyBudget: 100, lastIngestAt: null }, daily: days("2026-11-01", "2026-11-30", 30, 1) });
    expect(types(i)).toEqual([]);
  });

  it("sem verba cadastrada não avalia", () => {
    expect(types(input({ daily: days("2026-11-01", "2026-11-15", 999, 1) }))).toEqual([]);
  });
});

describe("sem conversão", () => {
  it("5 dias seguidos = atenção, 10 = crítico", () => {
    expect(types(input({ daily: [...days("2026-11-01", "2026-11-10", 20, 1), ...days("2026-11-11", "2026-11-15", 20, 0)] }))).toEqual(["no_conversions:warning"]);
    expect(types(input({ daily: days("2026-11-06", "2026-11-15", 20, 0) }))).toEqual(["no_conversions:critical"]);
  });

  it("4 dias ainda não avisa; conversão quebra a sequência", () => {
    expect(types(input({ daily: [...days("2026-11-01", "2026-11-11", 20, 1), ...days("2026-11-12", "2026-11-15", 20, 0)] }))).toEqual([]);
  });

  it("dia sem gasto não conta nem quebra", () => {
    const daily = [...days("2026-11-08", "2026-11-10", 20, 0), ...days("2026-11-11", "2026-11-12", 0, 0), ...days("2026-11-13", "2026-11-15", 20, 0)];
    const [f] = evaluateAlerts(input({ daily }));
    expect(f.message).toContain("6 dias seguidos");
  });

  it("campanhas pausadas (sem gasto) não geram alerta", () => {
    expect(types(input({ daily: days("2026-11-01", "2026-11-15", 0, 0) }))).toEqual([]);
  });

  it("dados velhos não geram alerta de conversão", () => {
    const i = input({ daily: days("2026-11-01", "2026-11-10", 20, 0), client: { lastIngestSource: "csv" } });
    expect(types(i)).toEqual([]);
  });
});

describe("custo por lead", () => {
  it("atenção a partir de 120% da meta, crítico a partir de 150%", () => {
    const daily = days("2026-11-02", "2026-11-15", 60, 1); // CPL 60
    expect(types(input({ client: { targetCpl: 55 }, daily }))).toEqual([]);
    expect(types(input({ client: { targetCpl: 50 }, daily }))).toEqual(["cpl_above_target:warning"]);
    expect(types(input({ client: { targetCpl: 40 }, daily }))).toEqual(["cpl_above_target:critical"]);
  });

  it("usa só os últimos 14 dias", () => {
    const daily = [...days("2026-10-01", "2026-11-01", 500, 1), ...days("2026-11-02", "2026-11-15", 40, 1)];
    expect(types(input({ client: { targetCpl: 40 }, daily }))).toEqual([]);
  });
});

describe("campanha sem impressões", () => {
  const campaigns = [
    { campaignId: "1", name: "Pesquisa FGTS", status: "ENABLED" },
    { campaignId: "2", name: "Marca", status: "ENABLED" },
    { campaignId: "3", name: "Antiga", status: "PAUSED" },
  ];
  const daily = days("2026-11-10", "2026-11-15", 20, 1);

  it("avisa só da campanha ativa que ficou 3 dias zerada", () => {
    const campaignDaily = [
      ...eachDay("2026-11-10", "2026-11-15").map((date) => ({ campaignId: "1", date, impressions: 100 })),
      { campaignId: "2", date: "2026-11-12", impressions: 50 },
    ];
    const found = evaluateAlerts(input({ daily, campaigns, campaignDaily }));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ type: "campaign_no_impressions", key: "2" });
    expect(found[0].message).toContain("Marca");
  });

  it("uma impressão nos últimos 3 dias já basta", () => {
    const campaignDaily = [
      { campaignId: "1", date: "2026-11-15", impressions: 1 },
      { campaignId: "2", date: "2026-11-13", impressions: 1 },
    ];
    expect(evaluateAlerts(input({ daily, campaigns, campaignDaily }))).toEqual([]);
  });
});

describe("script parou de enviar", () => {
  it("36 h = atenção, 72 h = crítico", () => {
    const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
    expect(types(input({ client: { lastIngestAt: at(35) } }))).toEqual([]);
    expect(types(input({ client: { lastIngestAt: at(37) } }))).toEqual(["stale_data:warning"]);
    expect(types(input({ client: { lastIngestAt: at(73) } }))).toEqual(["stale_data:critical"]);
  });

  it("cliente alimentado por CSV ou que nunca enviou não gera alerta", () => {
    const old = new Date(NOW.getTime() - 500 * 3_600_000);
    expect(types(input({ client: { lastIngestAt: old, lastIngestSource: "csv" } }))).toEqual([]);
    expect(types(input({ client: { lastIngestAt: null } }))).toEqual([]);
  });
});

it("cliente sem nenhum dado não quebra", () => {
  expect(evaluateAlerts(input({ client: { monthlyBudget: 500, targetCpl: 30, lastIngestAt: null } }))).toEqual([]);
  expect(addDays(TODAY, -1)).toBe("2026-11-15");
});
