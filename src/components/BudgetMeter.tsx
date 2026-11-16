import { brl0, pct } from "@/lib/format";

/**
 * Régua da verba do mês: a barra é o que já foi gasto e o traço é onde o gasto
 * deveria estar hoje se o mês fosse gasto por igual.
 */
export function BudgetMeter({
  spent,
  budget,
  expectedShare,
  compact = false,
}: {
  spent: number;
  budget: number | null;
  /** Fração do mês já decorrida (0 a 1). */
  expectedShare: number;
  compact?: boolean;
}) {
  if (!budget || budget <= 0) {
    return <span className="text-sm text-ink-3">{compact ? "sem verba definida" : "Verba mensal não definida"}</span>;
  }
  const share = spent / budget;
  const over = share > 1;
  return (
    <div className={compact ? "w-40" : "w-full"}>
      <div
        className="relative h-2 rounded-full bg-line print-exact"
        role="img"
        aria-label={`${pct(share, 0)} da verba gasta; o esperado para hoje é ${pct(expectedShare, 0)}`}
      >
        <div
          className={`h-2 rounded-full print-exact ${over ? "bg-critical" : "bg-ink"}`}
          style={{ width: `${Math.min(100, share * 100)}%` }}
        />
        <div
          className="absolute -top-1 h-4 w-0.5 rounded-full bg-brand print-exact"
          style={{ left: `calc(${Math.min(100, expectedShare * 100)}% - 1px)` }}
        />
      </div>
      <div className="num mt-1.5 text-[13px] text-ink-2">
        {brl0(spent)} de {brl0(budget)}
        {!compact && <span className="text-ink-3"> ({pct(share, 0)} gasto, {pct(expectedShare, 0)} do mês decorrido)</span>}
      </div>
    </div>
  );
}
