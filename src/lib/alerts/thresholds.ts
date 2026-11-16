/** Limites dos alertas. Mude aqui para deixar o painel mais ou menos sensível. */
export const THRESHOLDS = {
  budget: {
    /** Mínimo de dias com gasto no mês antes de projetar. */
    minActiveDays: 3,
    overWarning: 1.1,
    overCritical: 1.25,
    /** Mínimo de dias com gasto antes de avisar que vai sobrar verba. */
    underMinActiveDays: 7,
    underWarning: 0.75,
  },
  noConversions: { warningDays: 5, criticalDays: 10, lookbackDays: 30 },
  cpl: { windowDays: 14, warning: 1.2, critical: 1.5 },
  campaignNoImpressions: { days: 3 },
  stale: { warningHours: 36, criticalHours: 72 },
  /** Se o último dia com dados for mais antigo que isso, não avalia conversão nem campanhas. */
  freshDataDays: 3,
} as const;
