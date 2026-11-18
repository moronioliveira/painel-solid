"use client";

import { useEffect, useRef, useState } from "react";

export type ChartPoint = { date: string; value: number };
type Format = "brl" | "number";

const fmt = {
  brl: (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  number: (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }),
};
const axisFmt = {
  brl: (n: number) => `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: n < 10 && n % 1 ? 1 : 0 })}`,
  number: (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }),
};
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const longLabel = (iso: string) => `${WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]}, ${dayLabel(iso)}`;

/** Passo "redondo" para o eixo: 1, 2, 5, 10, 20, 50... */
function niceStep(max: number, ticks: number, integers: boolean): number {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  return integers ? Math.max(1, step) : step;
}

const H = 190;
const M = { top: 12, right: 18, bottom: 26, left: 56 };

/** Colunas por dia, uma série só. O título do bloco diz o que é; por isso não há legenda. */
export function ColumnChart({
  data,
  format,
  color,
  unit,
}: {
  data: ChartPoint[];
  format: Format;
  /** Cor da série (variável CSS). */
  color: string;
  /** Nome do que está sendo medido, para o leitor de tela e o balão. */
  unit: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = data.length;
  const max = Math.max(0, ...data.map((d) => d.value));
  const step = niceStep(max, 4, format === "number" && max >= 4);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);

  const plotW = width - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const band = n > 0 ? plotW / n : plotW;
  const barW = Math.max(1, Math.min(24, band - 2));
  const y = (v: number) => M.top + plotH - (v / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 52))));
  const total = data.reduce((s, d) => s + d.value, 0);

  const a = active !== null ? data[active] : null;
  const tipLeft = active !== null ? M.left + band * active + band / 2 : 0;

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setActive(null)}>
      <svg
        viewBox={`0 0 ${width} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`${unit} por dia, de ${n ? dayLabel(data[0].date) : ""} a ${n ? dayLabel(data[n - 1].date) : ""}. Total: ${fmt[format](total)}.`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-ink-3" fontSize={11}>
              {axisFmt[format](t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = M.left + band * i + (band - barW) / 2;
          const h = d.value > 0 ? Math.max(1.5, (d.value / top) * plotH) : 0;
          const r = Math.min(4, barW / 2, h);
          const yTop = M.top + plotH - h;
          return (
            <g key={d.date}>
              {h > 0 && (
                <path
                  d={`M${x},${M.top + plotH} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${M.top + plotH} Z`}
                  fill={color}
                  opacity={active === null || active === i ? 1 : 0.45}
                  className="print-exact"
                />
              )}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="num fill-ink-3" fontSize={11}>
                  {dayLabel(d.date)}
                </text>
              )}
              {/* área de toque maior que a coluna */}
              <rect
                x={M.left + band * i}
                y={M.top}
                width={band}
                height={plotH + M.bottom}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
              />
            </g>
          );
        })}
        <line x1={M.left} x2={width - M.right} y1={M.top + plotH} y2={M.top + plotH} className="stroke-line-strong" strokeWidth={1} />
      </svg>
      {a && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 text-left shadow-sm"
          style={{ left: `${(Math.min(Math.max(tipLeft, 70), width - 70) / width) * 100}%` }}
        >
          <div className="num text-sm font-semibold text-ink">{fmt[format](a.value)}</div>
          <div className="text-xs text-ink-2">{longLabel(a.date)}</div>
        </div>
      )}
    </div>
  );
}
