import Link from "next/link";
import { setActiveAction } from "@/app/actions";
import { BudgetMeter } from "@/components/BudgetMeter";
import { Delta } from "@/components/Delta";
import { levelFromAlerts, Signal, SignalIcon, type SignalLevel } from "@/components/Signal";
import { getDb } from "@/db";
import { accessLabel, accessState } from "@/lib/access";
import { syncAlerts } from "@/lib/alerts/sync";
import { requireUser } from "@/lib/auth/session";
import { todayInTz } from "@/lib/dates";
import { brl, change, conv, cpl, dateTime, fullDate, monthLabel } from "@/lib/format";
import { sumTotals } from "@/lib/metrics";
import { loadOverview } from "@/lib/overview";

const ORDER: Record<SignalLevel, number> = { critical: 0, warning: 1, ok: 2, nodata: 3 };

export default async function OverviewPage() {
  const user = await requireUser();
  const db = await getDb();
  await syncAlerts(db, user.workspaceId);
  const today = todayInTz(user.timezone);
  const { period, rows, archived, expectedShare } = await loadOverview(db, user.workspaceId, today);

  const withLevel = rows
    .map((r) => ({ ...r, level: levelFromAlerts(r.alerts, r.client.lastIngestAt !== null) }))
    .sort((a, b) => ORDER[a.level] - ORDER[b.level] || a.client.name.localeCompare(b.client.name, "pt-BR"));
  const total = sumTotals(rows.map((r) => r.current));
  const totalPrev = sumTotals(rows.map((r) => r.previous));
  const needAttention = withLevel.filter((r) => r.level === "critical" || r.level === "warning").length;
  const totalCpl = cpl(total.cost, total.conversions);
  // Clientes cujo link vence logo, já venceu ou está suspenso, com o mais urgente primeiro.
  const payments = rows
    .map((r) => ({ client: r.client, label: accessLabel(accessState(r.client, today)) }))
    .filter((p) => p.label.tone !== "ok")
    .sort((a, b) => (a.label.tone === b.label.tone ? 0 : a.label.tone === "critical" ? -1 : 1));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
          <p className="mt-1 text-sm text-ink-2">
            {monthLabel(today)}, dados até {fullDate(period.to)}. Comparação com os {period.prevLabel}.
          </p>
        </div>
        <Link href="/clientes/novo" className="btn btn-primary">Novo cliente</Link>
      </div>

      {rows.length === 0 ? (
        <div className="panel mt-8 px-6 py-12 text-center">
          <h2 className="text-lg font-semibold">Nenhum cliente cadastrado</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">
            Cadastre o primeiro cliente para receber a chave e o script que envia os dados do Google Ads para cá.
          </p>
          <Link href="/clientes/novo" className="btn btn-primary mt-5">Cadastrar cliente</Link>
        </div>
      ) : (
        <>
          <dl className="panel mt-6 grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-5 py-4">
              <dt className="text-sm text-ink-2">Investido no mês</dt>
              <dd className="num mt-1 text-2xl font-semibold tracking-tight">{brl(total.cost)}</dd>
              <dd className="mt-1 text-[13px]"><Delta value={change(total.cost, totalPrev.cost)} /></dd>
            </div>
            <div className="px-5 py-4">
              <dt className="text-sm text-ink-2">Conversões no mês</dt>
              <dd className="num mt-1 text-2xl font-semibold tracking-tight">
                {conv(total.conversions)}
                {totalCpl !== null && <span className="ml-2 text-sm font-normal text-ink-2">a {brl(totalCpl)} cada</span>}
              </dd>
              <dd className="mt-1 text-[13px]"><Delta value={change(total.conversions, totalPrev.conversions)} goodWhen="up" /></dd>
            </div>
            <div className="px-5 py-4">
              <dt className="text-sm text-ink-2">Clientes que precisam de atenção</dt>
              <dd className="num mt-1 text-2xl font-semibold tracking-tight">
                {needAttention} <span className="text-sm font-normal text-ink-2">de {rows.length}</span>
              </dd>
              <dd className="mt-1 text-[13px]">
                {needAttention > 0 ? (
                  <Link href="/alertas" className="underline underline-offset-2">Ver alertas</Link>
                ) : (
                  <span className="text-ink-2">Nenhum alerta aberto</span>
                )}
              </dd>
            </div>
          </dl>

          {payments.length > 0 && (
            <section className="panel mt-4 px-5 py-4" aria-labelledby="pagamentos">
              <h2 id="pagamentos" className="text-sm font-semibold">Acesso dos clientes ao relatório</h2>
              <ul className="mt-2 divide-y divide-line text-sm">
                {payments.map(({ client, label }) => (
                  <li key={client.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex items-center gap-2">
                      <SignalIcon level={label.tone === "muted" ? "nodata" : label.tone} />
                      <span className="font-medium">{client.name}</span>
                      <span className="text-ink-2">{label.text}</span>
                    </span>
                    <Link href={`/clientes/${client.id}/config#acesso`} className="underline underline-offset-2">Ver acesso</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="panel relative mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th className="th pl-5">Cliente</th>
                  <th className="th">Situação</th>
                  <th className="th">Verba do mês</th>
                  <th className="th text-right">Conversões</th>
                  <th className="th text-right">Custo por conversão</th>
                  <th className="th pr-5">Último envio</th>
                </tr>
              </thead>
              <tbody>
                {withLevel.map(({ client, current, previous, alerts, level }) => {
                  const cur = cpl(current.cost, current.conversions);
                  const prev = cpl(previous.cost, previous.conversions);
                  return (
                    <tr key={client.id} className="border-b border-line last:border-0 hover:bg-canvas/60">
                      <td className="td max-w-[340px] pl-5">
                        <Link href={`/clientes/${client.id}`} className="font-semibold underline-offset-2 hover:underline">
                          {client.name}
                        </Link>
                        {alerts[0] && (
                          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-2">
                            {alerts[0].message}
                            {alerts.length > 1 && <span className="text-ink-3"> (+{alerts.length - 1})</span>}
                          </p>
                        )}
                        {level === "nodata" && (
                          <p className="mt-0.5 text-[13px] text-ink-2">
                            Aguardando o primeiro envio.{" "}
                            <Link href={`/clientes/${client.id}/config#envio`} className="underline underline-offset-2">Instalar o script</Link>
                          </p>
                        )}
                      </td>
                      <td className="td"><Signal level={level} /></td>
                      <td className="td">
                        {level === "nodata" ? <span className="text-ink-3">—</span> : (
                          <BudgetMeter compact spent={current.cost} budget={client.monthlyBudget} expectedShare={expectedShare} />
                        )}
                      </td>
                      <td className="td text-right">
                        <div className="num font-medium">{level === "nodata" ? "—" : conv(current.conversions)}</div>
                        {level !== "nodata" && (
                          <div className="text-[13px]"><Delta value={change(current.conversions, previous.conversions)} goodWhen="up" /></div>
                        )}
                      </td>
                      <td className="td text-right">
                        <div className="num font-medium">{cur === null ? "—" : brl(cur)}</div>
                        <div className="text-[13px]">
                          {cur !== null && prev !== null ? (
                            <Delta value={change(cur, prev)} goodWhen="down" />
                          ) : client.targetCpl ? (
                            <span className="num text-ink-3">meta {brl(client.targetCpl)}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="td num pr-5 whitespace-nowrap text-ink-2">
                        {client.lastIngestAt ? dateTime(client.lastIngestAt, user.timezone) : "nunca"}
                        {client.lastIngestSource === "csv" && <span className="text-ink-3"> (CSV)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-2">
            <span className="inline-block h-3.5 w-0.5 rounded-full bg-brand" aria-hidden />
            Na régua da verba, o traço laranja marca onde o gasto estaria hoje se a verba fosse usada por igual ao longo do mês.
          </p>
        </>
      )}

      {archived.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-ink-2">Clientes arquivados</h2>
          <ul className="mt-2 divide-y divide-line border-y border-line text-sm">
            {archived.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2.5">
                <span>{c.name}</span>
                <form action={setActiveAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="active" value="1" />
                  <button type="submit" className="cursor-pointer underline underline-offset-2">Reativar</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
