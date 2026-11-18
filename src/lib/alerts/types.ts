export type AlertType =
  | "budget_over"
  | "budget_under"
  | "no_conversions"
  | "cpl_above_target"
  | "campaign_no_impressions"
  | "stale_data"
  | "conversion_setup"
  | "budget_limited";

export type Severity = "warning" | "critical";

export type Finding = {
  type: AlertType;
  /** Diferencia alertas do mesmo tipo (id da campanha). "" quando não se aplica. */
  key: string;
  severity: Severity;
  message: string;
};

export const ALERT_LABELS: Record<AlertType, string> = {
  budget_over: "Verba acabando",
  budget_under: "Verba sobrando",
  no_conversions: "Sem conversão",
  cpl_above_target: "Custo por lead acima da meta",
  campaign_no_impressions: "Campanha sem impressões",
  stale_data: "Script parou de enviar",
  conversion_setup: "Medição de conversão desligada",
  budget_limited: "Perdendo buscas por verba",
};

export type AlertInput = {
  /** Hoje no fuso do workspace. */
  today: string;
  now: Date;
  timezone: string;
  client: {
    monthlyBudget: number | null;
    targetCpl: number | null;
    lastIngestAt: Date | null;
    lastIngestSource: string | null;
  };
  /** Totais do cliente por dia. Precisa cobrir o mês atual e os últimos 30 dias. */
  daily: { date: string; cost: number; conversions: number }[];
  campaigns: { campaignId: string; name: string; status: string }[];
  /** Impressões por campanha e dia, pelo menos dos últimos dias. */
  campaignDaily: { campaignId: string; date: string; impressions: number }[];
  /** Ações de conversão da conta. Ausente quando o script ainda é o antigo. */
  conversionActions?: { name: string; status: string; primary: boolean }[];
  /** Parcela de impressões por campanha e dia (só o script novo manda). */
  campaignReach?: { campaignId: string; date: string; impressions: number; impressionShare: number | null; lostBudgetShare: number | null; lostRankShare: number | null }[];
};
