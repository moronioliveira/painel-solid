import { addDays, dayOfMonth, daysInMonth, diffDays, minDate, monthStart } from "../dates";
import { brl, brl0, conv, dateTime, pct } from "../format";
import { THRESHOLDS as T } from "./thresholds";
import type { AlertInput, Finding } from "./types";

/**
 * Regras dos alertas. Função pura: recebe os números, devolve o que está fora do trilho.
 * "Hoje" nunca entra na conta, porque o dia ainda está incompleto.
 */
export function evaluateAlerts(input: AlertInput): Finding[] {
  const findings: Finding[] = [];
  const yesterday = addDays(input.today, -1);
  const complete = input.daily.filter((d) => d.date <= yesterday);
  const lastDataDate = complete.reduce<string | null>(
    (max, d) => (max === null || d.date > max ? d.date : max),
    null,
  );

  findings.push(...staleData(input));
  if (lastDataDate === null) return findings;

  findings.push(...budgetPace(input, complete, minDate(yesterday, lastDataDate)));

  const fresh = diffDays(input.today, lastDataDate) <= T.freshDataDays;
  if (fresh) {
    findings.push(...noConversions(complete, lastDataDate));
    findings.push(...campaignNoImpressions(input, lastDataDate));
  }
  findings.push(...cplAboveTarget(input, complete, lastDataDate));
  return findings;
}

function staleData({ client, now, timezone }: AlertInput): Finding[] {
  if (!client.lastIngestAt || client.lastIngestSource !== "script") return [];
  const hours = (now.getTime() - client.lastIngestAt.getTime()) / 3_600_000;
  if (hours < T.stale.warningHours) return [];
  return [
    {
      type: "stale_data",
      key: "",
      severity: hours >= T.stale.criticalHours ? "critical" : "warning",
      message: `O painel não recebe dados desde ${dateTime(client.lastIngestAt, timezone)}. Confira se o script continua agendado na conta do Google Ads.`,
    },
  ];
}

function budgetPace(
  { client, today }: AlertInput,
  complete: AlertInput["daily"],
  refDay: string,
): Finding[] {
  const budget = client.monthlyBudget;
  if (!budget || budget <= 0) return [];
  const start = monthStart(today);
  if (refDay < start) return []; // ainda não há dia completo neste mês
  const month = complete.filter((d) => d.date >= start && d.date <= refDay);
  const spent = month.reduce((s, d) => s + d.cost, 0);
  const elapsed = dayOfMonth(refDay);
  const totalDays = daysInMonth(today);

  if (spent >= budget) {
    return [
      {
        type: "budget_over",
        key: "",
        severity: "critical",
        message: `A verba do mês (${brl0(budget)}) já foi atingida: ${brl(spent)} gastos até o dia ${elapsed}.`,
      },
    ];
  }

  const firstSpend = month.filter((d) => d.cost > 0).map((d) => d.date).sort()[0];
  if (!firstSpend) return [];
  // Conta o ritmo a partir do primeiro dia com gasto, para não errar com campanha que começou no meio do mês.
  const activeDays = elapsed - dayOfMonth(firstSpend) + 1;
  if (activeDays < T.budget.minActiveDays) return [];
  const rate = spent / activeDays;
  const projected = spent + rate * (totalDays - elapsed);
  const ratio = projected / budget;

  if (ratio >= T.budget.overWarning) {
    const dayOut = Math.min(totalDays, elapsed + Math.ceil((budget - spent) / rate));
    return [
      {
        type: "budget_over",
        key: "",
        severity: ratio >= T.budget.overCritical ? "critical" : "warning",
        message: `No ritmo atual (${brl(rate)}/dia), a verba de ${brl0(budget)} acaba por volta do dia ${dayOut}. Projeção do mês: ${brl0(projected)} (${pct(ratio, 0)} da verba).`,
      },
    ];
  }
  if (ratio <= T.budget.underWarning && activeDays >= T.budget.underMinActiveDays) {
    return [
      {
        type: "budget_under",
        key: "",
        severity: "warning",
        message: `No ritmo atual (${brl(rate)}/dia), o mês fecha em ${brl0(projected)}: ${pct(ratio, 0)} da verba de ${brl0(budget)}.`,
      },
    ];
  }
  return [];
}

function noConversions(complete: AlertInput["daily"], lastDataDate: string): Finding[] {
  const byDate = new Map(complete.map((d) => [d.date, d]));
  let streak = 0;
  let spent = 0;
  for (let i = 0; i < T.noConversions.lookbackDays; i++) {
    const day = byDate.get(addDays(lastDataDate, -i));
    if (!day || day.cost <= 0) continue; // dia sem gasto não conta nem quebra a sequência
    if (day.conversions > 0) break;
    streak++;
    spent += day.cost;
  }
  if (streak < T.noConversions.warningDays) return [];
  return [
    {
      type: "no_conversions",
      key: "",
      severity: streak >= T.noConversions.criticalDays ? "critical" : "warning",
      message: `${streak} dias seguidos com gasto e nenhuma conversão (${brl(spent)} gastos nesse período).`,
    },
  ];
}

function cplAboveTarget(
  { client }: AlertInput,
  complete: AlertInput["daily"],
  lastDataDate: string,
): Finding[] {
  const target = client.targetCpl;
  if (!target || target <= 0) return [];
  const from = addDays(lastDataDate, -(T.cpl.windowDays - 1));
  const window = complete.filter((d) => d.date >= from && d.date <= lastDataDate);
  const cost = window.reduce((s, d) => s + d.cost, 0);
  const conversions = window.reduce((s, d) => s + d.conversions, 0);
  if (conversions < 1) return []; // sem conversão é assunto do alerta "sem conversão"
  const value = cost / conversions;
  const ratio = value / target;
  if (ratio < T.cpl.warning) return [];
  return [
    {
      type: "cpl_above_target",
      key: "",
      severity: ratio >= T.cpl.critical ? "critical" : "warning",
      message: `Custo por lead de ${brl(value)} nos últimos ${T.cpl.windowDays} dias, ${pct(ratio - 1, 0)} acima da meta de ${brl(target)} (${conv(conversions)} conversões).`,
    },
  ];
}

function campaignNoImpressions(input: AlertInput, lastDataDate: string): Finding[] {
  const { days } = T.campaignNoImpressions;
  const from = addDays(lastDataDate, -(days - 1));
  const impressions = new Map<string, number>();
  for (const row of input.campaignDaily) {
    if (row.date < from || row.date > lastDataDate) continue;
    impressions.set(row.campaignId, (impressions.get(row.campaignId) ?? 0) + row.impressions);
  }
  return input.campaigns
    .filter((c) => c.status === "ENABLED" && (impressions.get(c.campaignId) ?? 0) === 0)
    .map((c) => ({
      type: "campaign_no_impressions" as const,
      key: c.campaignId,
      severity: "warning" as const,
      message: `A campanha "${c.name}" está ativa, mas não teve impressões nos últimos ${days} dias.`,
    }));
}
