/** O Google Ads gasta em média 30,4 vezes a verba diária por mês. */
export const DAYS_PER_MONTH = 30.4;

export function dailyToMonthly(daily: number): number {
  return Math.round(daily * DAYS_PER_MONTH * 100) / 100;
}
