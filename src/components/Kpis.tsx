import { brl, change, conv, cpl, int, pct } from "@/lib/format";
import type { Totals } from "@/lib/metrics";
import { TERMS, type Audience } from "@/lib/terms";
import { Delta } from "./Delta";

/** Os quatro números do período, com a variação contra o período anterior. */
export function Kpis({
  totals,
  previous,
  prevLabel,
  targetCpl,
  audience = "team",
}: {
  totals: Totals;
  previous: Totals;
  prevLabel: string;
  targetCpl?: number | null;
  audience?: Audience;
}) {
  const T = TERMS[audience];
  const cur = cpl(totals.cost, totals.conversions);
  const prev = cpl(previous.cost, previous.conversions);
  const ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : null;
  const items = [
    {
      label: T.invested,
      value: brl(totals.cost),
      delta: <Delta value={change(totals.cost, previous.cost)} />,
    },
    {
      label: T.conversions,
      value: conv(totals.conversions),
      delta: <Delta value={change(totals.conversions, previous.conversions)} goodWhen="up" />,
    },
    {
      label: T.costPer,
      value: cur === null ? "—" : brl(cur),
      note: targetCpl ? `meta ${brl(targetCpl)}` : undefined,
      delta: cur !== null && prev !== null ? <Delta value={change(cur, prev)} goodWhen="down" /> : null,
    },
    {
      label: T.clicks,
      value: int(totals.clicks),
      note: ctr === null ? undefined : T.clickShare(pct(ctr)),
      delta: <Delta value={change(totals.clicks, previous.clicks)} goodWhen="up" />,
    },
  ];
  return (
    <div className="avoid-break">
      {/* gap-px sobre fundo cinza desenha as divisórias em qualquer número de colunas */}
      <dl className="print-exact grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4 print:grid-cols-4">
        {items.map((it) => (
          <div
            key={it.label}
            className="bg-surface px-5 py-4 print:px-3"
          >
            <dt className="text-sm text-ink-2">{it.label}</dt>
            <dd className="num mt-1 text-2xl font-semibold tracking-tight">{it.value}</dd>
            <dd className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px]">
              {it.delta}
              {it.note && <span className="num text-ink-3">{it.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[13px] text-ink-3">{T.compareWith}{audience === "team" ? ":" : ""} {prevLabel}.</p>
    </div>
  );
}
