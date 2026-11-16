import { describe, expect, it } from "vitest";
import { decodeCsv, parseAdsCsv, parseDate, parseNumber } from "@/lib/csv";

describe("parseNumber", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["R$ 12,00", 12],
    ["1.234", 1234],
    ["1,234", 1234],
    ["12.5", 12.5],
    ["1,5", 1.5],
    ["0,00", 0],
    ["--", 0],
    ["", 0],
    [" 3 ", 3],
    ["1.234.567", 1234567],
  ])("%s -> %d", (raw, expected) => expect(parseNumber(raw)).toBe(expected));
});

describe("parseDate", () => {
  it.each([
    ["2026-11-16", "2026-11-16"],
    ["16/11/2026", "2026-11-16"],
    ["16 de nov. de 2026", "2026-11-16"],
    ["1 de março de 2026", "2026-03-01"],
    ["Nov 16, 2026", "2026-11-16"],
    ["Total: conta", null],
    ["31/02/2026", null],
  ])("%s -> %s", (raw, expected) => expect(parseDate(raw)).toBe(expected));

  it("aceita mês primeiro quando pedido", () => expect(parseDate("11/16/2026", true)).toBe("2026-11-16"));
});

const PT = `Relatório de campanhas
1 de novembro de 2026 - 3 de novembro de 2026
Dia,Campanha,Status da campanha,Impr.,Cliques,CTR,Custo,Conversões,Custo / conv.,Valor conv.
2026-11-01,Pesquisa FGTS,Ativada,"1.250",48,"3,84%","R$ 96,40","3,00","R$ 32,13","0,00"
2026-11-02,Pesquisa FGTS,Ativada,980,31,"3,16%","R$ 71,05","1,50","R$ 47,37","0,00"
2026-11-02,Marca,Ativada,120,22,"18,33%","R$ 9,90","2,00","R$ 4,95","0,00"
Total: conta,--,--,"2.350",101,"4,30%","R$ 177,35","6,50","R$ 27,28","0,00"
`;

describe("parseAdsCsv", () => {
  it("lê o export em português, ignora título e linha de total", () => {
    const r = parseAdsCsv(PT);
    expect(r).toMatchObject({ ok: true, from: "2026-11-01", to: "2026-11-02", skipped: 1 });
    if (!r.ok) return;
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toEqual({
      date: "2026-11-01",
      campaignId: "nome:Pesquisa FGTS",
      campaignName: "Pesquisa FGTS",
      impressions: 1250,
      clicks: 48,
      cost: 96.4,
      conversions: 3,
      conversionsValue: 0,
    });
    expect(r.rows[1].conversions).toBe(1.5);
  });

  it("não confunde Custo com Custo / conv. nem Conversões com Taxa de conv.", () => {
    const csv = `Dia;Campanha;Taxa de conv.;Custo / conv.;Custo;Conversões\n02/11/2026;A;10%;99,00;50,00;2\n`;
    const r = parseAdsCsv(csv);
    expect(r.ok && r.rows[0]).toMatchObject({ date: "2026-11-02", cost: 50, conversions: 2 });
  });

  it("lê o export em inglês com data americana e ID da campanha", () => {
    const csv = `Campaign report\nDay,Campaign,Campaign ID,Impressions,Clicks,Cost,Conversions\n11/13/2026,Search,123,"1,200",40,"1,034.50",4.00\n11/14/2026,Search,123,900,30,80.25,0.00\n`;
    const r = parseAdsCsv(csv);
    expect(r).toMatchObject({ ok: true, from: "2026-11-13", to: "2026-11-14" });
    expect(r.ok && r.rows[0]).toMatchObject({ campaignId: "123", impressions: 1200, cost: 1034.5 });
  });

  it("lê o CSV para Excel (UTF-16 com tabulação)", () => {
    const text = "Dia\tCampanha\tImpr.\tCliques\tCusto\n2026-11-01\tA\t10\t2\t1,50\n";
    const buf = new Uint8Array(2 + text.length * 2);
    buf.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) buf[2 + i * 2] = text.charCodeAt(i);
    const r = parseAdsCsv(decodeCsv(buf));
    expect(r.ok && r.rows[0]).toMatchObject({ campaignName: "A", impressions: 10, cost: 1.5 });
  });

  it("explica o que falta quando não há coluna de dia", () => {
    const r = parseAdsCsv("Campanha,Cliques\nA,1\n");
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toContain("Dia");
  });

  it("arquivo só com totais é recusado", () => {
    expect(parseAdsCsv("Dia,Campanha,Custo\nTotal,--,10\n")).toMatchObject({ ok: false });
  });
});
