import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { clients, dailyMetrics, monthlyResults, type MonthlyResult } from "@/db/schema";
import { brl } from "./format";

export type ResultInput = { leads: number | null; deals: number | null; revenue: number | null };
type AdsMonth = { cost: number; conversions: number };

export type BusinessMetrics = {
  /** Investimento dividido pelos contatos que chegaram. */
  costPerLead: number | null;
  costPerDeal: number | null;
  /** Fração dos contatos que fecharam. */
  closeRate: number | null;
  /** Receita para cada R$ 1 investido em anúncios. */
  returnPerReal: number | null;
  /** Conversões do Google ÷ contatos recebidos: perto de 1 = medição batendo. */
  measuredShare: number | null;
};

const div = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : a / b);

export function businessMetrics(ads: AdsMonth, r: ResultInput): BusinessMetrics {
  const cost = ads.cost > 0 ? ads.cost : null;
  return {
    costPerLead: div(cost, r.leads),
    costPerDeal: div(cost, r.deals),
    closeRate: div(r.deals, r.leads),
    returnPerReal: div(r.revenue, cost),
    measuredShare: div(ads.conversions > 0 ? ads.conversions : null, r.leads),
  };
}

export async function listResults(db: Db, workspaceId: string, clientId: string): Promise<MonthlyResult[]> {
  return db
    .select()
    .from(monthlyResults)
    .where(and(eq(monthlyResults.clientId, clientId), eq(monthlyResults.workspaceId, workspaceId)))
    .orderBy(desc(monthlyResults.month));
}

/** Grava o resultado do mês. Com os três campos vazios, apaga o registro. */
export async function saveResult(
  db: Db,
  input: ResultInput & { workspaceId: string; clientId: string; month: string },
): Promise<void> {
  const [owner] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.workspaceId, input.workspaceId)));
  if (!owner) throw new Error("Cliente não pertence a esta conta.");
  const where = and(eq(monthlyResults.clientId, input.clientId), eq(monthlyResults.month, input.month));
  if (input.leads == null && input.deals == null && input.revenue == null) {
    await db.delete(monthlyResults).where(where);
    return;
  }
  const values = { leads: input.leads, deals: input.deals, revenue: input.revenue, updatedAt: new Date() };
  await db
    .insert(monthlyResults)
    .values({ workspaceId: input.workspaceId, clientId: input.clientId, month: input.month, ...values })
    .onConflictDoUpdate({ target: [monthlyResults.clientId, monthlyResults.month], set: values });
}

/** Investimento e conversões do Google Ads em cada mês ("AAAA-MM"). */
export async function monthlyCosts(db: Db, clientId: string): Promise<Map<string, AdsMonth>> {
  const rows = await db
    .select({
      month: sql<string>`to_char(${dailyMetrics.date}, 'YYYY-MM')`,
      cost: sql<number>`coalesce(sum(${dailyMetrics.cost}), 0)::float8`.mapWith(Number),
      conversions: sql<number>`coalesce(sum(${dailyMetrics.conversions}), 0)::float8`.mapWith(Number),
    })
    .from(dailyMetrics)
    .where(eq(dailyMetrics.clientId, clientId))
    .groupBy(sql`1`);
  return new Map(rows.map((r) => [r.month, { cost: r.cost, conversions: r.conversions }]));
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

/** Frase para o resumo do relatório mensal. Null quando não há resultado informado. */
export function resultSummary(ads: AdsMonth, r: ResultInput): string | null {
  if (r.leads == null && r.deals == null && r.revenue == null) return null;
  const parts: string[] = [];
  if (r.leads != null) parts.push(`${r.leads === 1 ? "chegou" : "chegaram"} ${plural(r.leads, "conversa de cliente", "conversas de clientes")}`);
  if (r.deals != null) {
    if (r.deals === 0) parts.push(r.leads != null ? "nenhuma virou contrato fechado ainda" : "nenhum contrato foi fechado ainda");
    else if (r.leads != null) parts.push(`${r.deals.toLocaleString("pt-BR")} ${r.deals === 1 ? "virou contrato fechado" : "viraram contratos fechados"}`);
    else parts.push(`${r.deals === 1 ? "foi fechado" : "foram fechados"} ${plural(r.deals, "contrato", "contratos")}`);
  }
  let s = `No negócio, ${parts.join(" e ")}`;
  if (r.revenue != null && r.revenue > 0) s += `${parts.length ? ", somando " : "a receita foi de "}${brl(r.revenue)}`;
  s += ".";
  const ret = businessMetrics(ads, r).returnPerReal;
  if (ret !== null && ret > 0) s += ` Cada R$ 1 investido em anúncios trouxe ${brl(ret)} em receita.`;
  return s;
}

export type BusinessItem = { label: string; value: string; note?: string };

/** Os quatro números do bloco "Resultado no negócio" do relatório, só os que têm valor. */
export function businessItems(ads: AdsMonth, r: ResultInput): BusinessItem[] {
  const m = businessMetrics(ads, r);
  const items: { label: string; value: string | null; note?: string }[] = [
    { label: "Conversas que chegaram", value: r.leads == null ? null : r.leads.toLocaleString("pt-BR"), note: m.costPerLead === null ? undefined : `${brl(m.costPerLead)} de anúncio por conversa` },
    { label: "Contratos fechados", value: r.deals == null ? null : r.deals.toLocaleString("pt-BR"), note: m.closeRate === null ? undefined : `${Math.round(m.closeRate * 100)}% das conversas` },
    { label: "Receita dos contratos", value: r.revenue == null ? null : brl(r.revenue), note: m.costPerDeal === null ? undefined : `${brl(m.costPerDeal)} de anúncio por contrato` },
    { label: "Retorno", value: m.returnPerReal === null ? null : brl(m.returnPerReal), note: m.returnPerReal === null ? undefined : "em receita para cada R$ 1 investido em anúncios" },
  ];
  return items.filter((i): i is BusinessItem => i.value !== null);
}
