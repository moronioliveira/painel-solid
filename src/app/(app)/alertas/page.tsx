import type { Metadata } from "next";
import Link from "next/link";
import { SignalIcon } from "@/components/Signal";
import { getDb } from "@/db";
import { openAlerts, syncAlerts } from "@/lib/alerts/sync";
import { ALERT_LABELS, type AlertType } from "@/lib/alerts/types";
import { requireUser } from "@/lib/auth/session";
import { dateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Alertas" };

export default async function AlertsPage() {
  const user = await requireUser();
  const db = await getDb();
  await syncAlerts(db, user.workspaceId);
  const alerts = await openAlerts(db, user.workspaceId);
  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <>
      <p className="eyebrow">O que precisa da sua atenção</p>
      <h1 className="mt-2 text-[32px] leading-tight font-semibold sm:text-[40px]">Alertas</h1>
      <p className="mt-1 text-sm text-ink-2">
        {alerts.length === 0
          ? "Nenhum alerta aberto. Todos os clientes estão dentro dos limites."
          : `${alerts.length} ${alerts.length === 1 ? "alerta aberto" : "alertas abertos"}${critical ? `, ${critical} ${critical === 1 ? "crítico" : "críticos"}` : ""}. Um alerta fecha sozinho quando o problema deixa de aparecer nos dados.`}
      </p>

      {alerts.length > 0 && (
        <ul className="panel mt-6 divide-y divide-line">
          {alerts.map((a) => (
            <li key={a.id} className="flex gap-3 px-4 py-4 sm:px-5">
              <span className="mt-0.5 shrink-0">
                <SignalIcon level={a.severity === "critical" ? "critical" : "warning"} size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <Link href={`/clientes/${a.clientId}`} className="tap font-display text-[16px] font-semibold underline-offset-4 hover:underline">
                    {a.clientName}
                  </Link>
                  <span className="text-sm text-ink-2">
                    {ALERT_LABELS[a.type as AlertType] ?? a.type}
                    <span className="sr-only">, {a.severity === "critical" ? "crítico" : "atenção"}</span>
                  </span>
                </div>
                <p className="mt-1 max-w-[75ch] text-sm leading-relaxed text-ink-2">{a.message}</p>
                <p className="num mt-1.5 text-[13px] text-ink-3 sm:hidden">desde {dateTime(a.firstSeenAt, user.timezone)}</p>
              </div>
              <span className="num hidden shrink-0 text-[13px] whitespace-nowrap text-ink-3 sm:inline">desde {dateTime(a.firstSeenAt, user.timezone)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
