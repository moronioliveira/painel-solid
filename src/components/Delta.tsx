import { pct } from "@/lib/format";

/**
 * Variação contra o período anterior.
 * `goodWhen` diz se subir é bom (conversões), ruim (custo por conversão) ou neutro (gasto).
 */
export function Delta({
  value,
  goodWhen = "neutral",
}: {
  value: number | null;
  goodWhen?: "up" | "down" | "neutral";
}) {
  if (value === null) return <span className="text-ink-3">sem comparação</span>;
  if (Math.abs(value) < 0.005) return <span className="text-ink-2">igual</span>;
  const up = value > 0;
  const good = goodWhen === "neutral" ? null : (goodWhen === "up") === up;
  const tone = good === null ? "text-ink-2" : good ? "text-good-ink" : "text-critical-ink";
  return (
    <span className={`num inline-flex items-center gap-1 whitespace-nowrap ${tone}`}>
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden>
        <path d={up ? "M5 1l4.2 7.5H.8z" : "M5 9L.8 1.5h8.4z"} fill="currentColor" />
      </svg>
      <span>
        {up ? "+" : "−"}
        {pct(Math.abs(value), 0)}
      </span>
      <span className="sr-only">{good === null ? "" : good ? "(melhorou)" : "(piorou)"}</span>
    </span>
  );
}
