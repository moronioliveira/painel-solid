import { brl, conv, dayMonth, int } from "@/lib/format";
import type { DayTotals } from "@/lib/metrics";
import { ColumnChart } from "./ColumnChart";

/** Dois gráficos com o mesmo eixo de dias (gasto e conversões têm escalas diferentes, então não dividem um gráfico). */
export function DailyCharts({ daily }: { daily: DayTotals[] }) {
  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
        <figure className="panel avoid-break px-5 pt-4 pb-3">
          <figcaption className="mb-3 text-sm font-semibold">Investimento por dia</figcaption>
          <ColumnChart data={daily.map((d) => ({ date: d.date, value: d.cost }))} format="brl" color="var(--color-series-cost)" unit="Investimento" />
        </figure>
        <figure className="panel avoid-break px-5 pt-4 pb-3">
          <figcaption className="mb-3 text-sm font-semibold">Conversões por dia</figcaption>
          <ColumnChart data={daily.map((d) => ({ date: d.date, value: d.conversions }))} format="number" color="var(--color-series-conv)" unit="Conversões" />
        </figure>
      </div>
      <details className="no-print mt-2 text-sm">
        <summary className="cursor-pointer text-ink-2 underline underline-offset-2">Ver os números por dia</summary>
        <div className="panel relative mt-2 max-h-80 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line">
                <th className="th pl-5">Dia</th>
                <th className="th text-right">Impressões</th>
                <th className="th text-right">Cliques</th>
                <th className="th text-right">Investido</th>
                <th className="th pr-5 text-right">Conversões</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.date} className="num border-b border-line last:border-0">
                  <td className="px-3 py-1.5 pl-5">{dayMonth(d.date)}</td>
                  <td className="px-3 py-1.5 text-right">{int(d.impressions)}</td>
                  <td className="px-3 py-1.5 text-right">{int(d.clicks)}</td>
                  <td className="px-3 py-1.5 text-right">{brl(d.cost)}</td>
                  <td className="px-3 py-1.5 pr-5 text-right">{conv(d.conversions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
