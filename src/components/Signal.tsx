export type SignalLevel = "ok" | "warning" | "critical" | "nodata";

const LABELS: Record<SignalLevel, string> = {
  ok: "Em dia",
  warning: "Atenção",
  critical: "Crítico",
  nodata: "Sem dados",
};

/** Ícone com forma própria para cada estado: o estado não depende só da cor. */
export function SignalIcon({ level, size = 14 }: { level: SignalLevel; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": true } as const;
  if (level === "ok")
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="7" className="fill-good" />
        <path d="M4.7 8.3l2.2 2.2 4.4-4.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (level === "warning")
    return (
      <svg {...common}>
        <path d="M8 1.2l7.2 13H.8z" className="fill-warning" strokeLinejoin="round" />
        <path d="M8 6v4" stroke="#0b0b0b" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="8" cy="12.2" r="1" fill="#0b0b0b" />
      </svg>
    );
  if (level === "critical")
    return (
      <svg {...common}>
        <path d="M5 1h6l4 4v6l-4 4H5l-4-4V5z" className="fill-critical" />
        <path d="M5.5 5.5l5 5m0-5l-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6" fill="none" className="stroke-ink-3" strokeWidth="1.6" strokeDasharray="2.6 2.6" />
    </svg>
  );
}

export function Signal({ level, label }: { level: SignalLevel; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap text-ink">
      <SignalIcon level={level} />
      {label ?? LABELS[level]}
    </span>
  );
}

export function levelFromAlerts(alerts: { severity: string }[], hasData: boolean): SignalLevel {
  if (alerts.some((a) => a.severity === "critical")) return "critical";
  if (alerts.length > 0) return "warning";
  return hasData ? "ok" : "nodata";
}
