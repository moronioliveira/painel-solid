import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BudgetMeter } from "@/components/BudgetMeter";
import { CampaignTable } from "@/components/CampaignTable";
import { DailyCharts } from "@/components/DailyCharts";
import { Kpis } from "@/components/Kpis";
import { levelFromAlerts, Signal, SignalIcon } from "@/components/Signal";
import { getDb } from "@/db";
import { alerts, conversionActions, dailyMetrics, keywords, searchTerms } from "@/db/schema";
import { ConversionActionsSection, KeywordsSection, ScriptUpdateHint, SearchTermsSection } from "@/components/AdsDetails";
import { reachByCampaign, searchTermSummary } from "@/lib/ads-extras";
import { ResultForm } from "@/components/ResultForm";
import { syncAlerts } from "@/lib/alerts/sync";
import { ALERT_LABELS, type AlertType } from "@/lib/alerts/types";
import { requireUser } from "@/lib/auth/session";
import { getClient } from "@/lib/clients";
import { businessMetrics, listResults, monthlyCosts } from "@/lib/results";
import { addMonths, dayOfMonth, daysInMonth, todayInTz } from "@/lib/dates";
import { brl, conv, dateTime, fullDate, monthLabel, pct } from "@/lib/format";
import { campaignTotals, dailyTotals, monthsWithData, sumTotals } from "@/lib/metrics";
import { isPeriodKey, PERIOD_OPTIONS, resolvePeriod } from "@/lib/periods";

export const metadata: Metadata = { title: "Cliente" };

export default async function ClientPage(props: PageProps<"/clientes/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const db = await getDb();
  const client = await getClient(db, user.workspaceId, id);
  if (!client) notFound();

  await syncAlerts(db, user.workspaceId, { clientId: client.id });
  const today = todayInTz(user.timezone);
  const period = resolvePeriod(isPeriodKey(sp.p) ? sp.p : "mes", today);

  const [daily, prevDaily, campaigns, history, months, results, costs, reachRows, termRows, keywordRows, actionRows] = await Promise.all([
    dailyTotals(db, client.id, period.from, period.to),
    dailyTotals(db, client.id, period.prevFrom, period.prevTo),
    campaignTotals(db, client.id, period.from, period.to),
    db
      .select()
      .from(alerts)
      .where(and(eq(alerts.clientId, client.id), eq(alerts.workspaceId, user.workspaceId)))
      .orderBy(desc(alerts.firstSeenAt))
      .limit(30),
    monthsWithData(db, client.id),
    listResults(db, user.workspaceId, client.id),
    monthlyCosts(db, client.id),
    db
      .select({
        campaignId: dailyMetrics.campaignId,
        impressions: dailyMetrics.impressions,
        impressionShare: dailyMetrics.impressionShare,
        lostBudgetShare: dailyMetrics.lostBudgetShare,
        lostRankShare: dailyMetrics.lostRankShare,
      })
      .from(dailyMetrics)
      .where(and(eq(dailyMetrics.clientId, client.id), gte(dailyMetrics.date, period.from), lte(dailyMetrics.date, period.to))),
    db
      .select({ term: searchTerms.term, impressions: searchTerms.impressions, clicks: searchTerms.clicks, cost: searchTerms.cost, conversions: searchTerms.conversions })
      .from(searchTerms)
      .where(and(eq(searchTerms.clientId, client.id), gte(searchTerms.date, period.from), lte(searchTerms.date, period.to))),
    db.select().from(keywords).where(eq(keywords.clientId, client.id)),
    db.select().from(conversionActions).where(eq(conversionActions.clientId, client.id)),
  ]);
  const reach = reachByCampaign(reachRows);
  // Conversões gravadas só chegam pelo script novo; sem elas, o cliente ainda usa o antigo.
  const hasExtras = actionRows.length > 0;
  const saved = Object.fromEntries(results.map((r) => [r.month, { leads: r.leads, deals: r.deals, revenue: r.revenue }]));
  const thisMonth = today.slice(0, 7);
  // Nos primeiros dias do mês o normal é lançar o mês que acabou de fechar.
  const resultMonth = dayOfMonth(today) <= 10 ? addMonths(thisMonth, -1) : thisMonth;
  const totals = sumTotals(daily);
  const previous = sumTotals(prevDaily);
  const open = history
    .filter((a) => a.status === "open")
    .sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical"));
  const resolved = history.filter((a) => a.status !== "open");
  const level = levelFromAlerts(open, client.lastIngestAt !== null);
  const monthSpent = period.key === "mes" ? totals.cost : null;

  return (
    <>
      <nav className="text-sm text-ink-2" aria-label="Você está em">
        <Link href="/" className="underline underline-offset-2">Visão geral</Link> / {client.name}
      </nav>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h1 className="text-[28px] leading-tight font-semibold sm:text-[36px]">{client.name}</h1>
          <Signal level={level} />
          {!client.active && <span className="rounded border border-line-strong px-2 py-0.5 text-xs text-ink-2">Arquivado</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/r/${client.reportToken}`} className="btn btn-quiet" target="_blank">Abrir relatório</Link>
          <Link href={`/clientes/${client.id}/config`} className="btn btn-quiet">Configuração</Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        {client.adsCustomerId ? `Conta Google Ads ${client.adsCustomerId}. ` : ""}
        {client.lastIngestAt
          ? `Último envio em ${dateTime(client.lastIngestAt, user.timezone)}${client.lastIngestSource === "csv" ? " (arquivo CSV)" : ""}.`
          : "Ainda não recebeu dados."}
      </p>

      {client.lastIngestAt === null ? (
        <div className="panel mt-8 px-6 py-10">
          <h2 className="text-lg font-semibold">Falta ligar os dados deste cliente</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-2">
            Instale o script na conta do Google Ads para o envio diário, ou importe um relatório em CSV para começar pelo histórico.
          </p>
          <Link href={`/clientes/${client.id}/config#envio`} className="btn btn-primary mt-5">Ligar os dados</Link>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
              {open.map((a) => (
                <li key={a.id} className="flex gap-3 px-5 py-3">
                  <span className="mt-0.5 shrink-0"><SignalIcon level={a.severity === "critical" ? "critical" : "warning"} size={16} /></span>
                  <p className="text-sm leading-relaxed">
                    <span className="font-semibold">{ALERT_LABELS[a.type as AlertType] ?? a.type}.</span> {a.message}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {/* Menu de seções: a página é longa, então cada parte tem um atalho. */}
          <nav className="no-print sticky top-[59px] z-20 -mx-4 mt-8 overflow-x-auto border-y border-line bg-canvas/95 px-4 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-2" aria-label="Seções do cliente">
            <ul className="flex gap-1 whitespace-nowrap text-sm font-semibold">
              {[
                ["resumo", "Resumo"],
                ["campanhas", "Campanhas"],
                ...(hasExtras ? [["pesquisas", "Pesquisas e palavras"], ["medicao", "Medição"]] : []),
                ["resultado", "Resultado no negócio"],
                ["relatorios", "Relatórios"],
              ].map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="tap inline-flex rounded-md px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink">{label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div id="resumo" className="mt-6 flex scroll-mt-32 flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-md border border-line-strong bg-surface p-0.5 text-sm" role="group" aria-label="Período">
              {PERIOD_OPTIONS.map((o) => (
                <Link
                  key={o.key}
                  href={o.key === "mes" ? `/clientes/${client.id}` : `/clientes/${client.id}?p=${o.key}`}
                  aria-current={o.key === period.key ? "true" : undefined}
                  className={`tap rounded px-3 py-1.5 font-semibold ${o.key === period.key ? "bg-ink text-canvas" : "text-ink-2 hover:text-ink"}`}
                >
                  {o.label}
                </Link>
              ))}
            </div>
            <p className="num text-sm text-ink-2">{fullDate(period.from)} a {fullDate(period.to)}</p>
          </div>

          <div className="mt-4"><Kpis totals={totals} previous={previous} prevLabel={period.prevLabel} targetCpl={client.targetCpl} /></div>

          {monthSpent !== null && (
            <div className="panel mt-4 px-5 py-4">
              <h2 className="mb-3 text-sm font-semibold">Verba de {monthLabel(today)}</h2>
              <BudgetMeter
                spent={monthSpent}
                budget={client.monthlyBudget}
                expectedShare={today.endsWith("-01") ? 0 : dayOfMonth(period.to) / daysInMonth(today)}
              />
            </div>
          )}

          <div className="mt-4"><DailyCharts daily={daily} /></div>

          <h2 id="campanhas" className="mt-12 mb-3 scroll-mt-32 text-[22px] font-semibold">Campanhas</h2>
          <CampaignTable campaigns={campaigns} reach={reach} />

          {hasExtras ? (
            <>
              <SearchTermsSection terms={searchTermSummary(termRows)} periodLabel={`de ${fullDate(period.from)} a ${fullDate(period.to)}`} />
              <KeywordsSection keywords={keywordRows} />
              <ConversionActionsSection actions={actionRows} />
            </>
          ) : (
            <ScriptUpdateHint clientId={client.id} />
          )}

          <section id="resultado" className="mt-12 scroll-mt-32">
            <h2 className="text-[22px] font-semibold">Resultado no negócio</h2>
            <p className="mt-1 mb-4 max-w-[70ch] text-sm leading-relaxed text-ink-2">
              O que os anúncios viraram de verdade para o cliente. Aparece também no relatório mensal dele, quando preenchido.
            </p>
            {results.length > 0 && (
              <div className="panel mb-6 overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="th pl-5">Mês</th>
                      <th className="th text-right">Conversas</th>
                      <th className="th text-right">Contratos</th>
                      <th className="th text-right">Receita</th>
                      <th className="th text-right">Custo por conversa</th>
                      <th className="th text-right">Custo por contrato</th>
                      <th className="th text-right">Retorno</th>
                      <th className="th pr-5 text-right">Conversões no Google</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const ads = costs.get(r.month) ?? { cost: 0, conversions: 0 };
                      const m = businessMetrics(ads, r);
                      return (
                        <tr key={r.month} className="border-b border-line last:border-0">
                          <td className="td pl-5 first-letter:uppercase">{monthLabel(r.month)}</td>
                          <td className="td num text-right">{r.leads ?? "—"}</td>
                          <td className="td num text-right">
                            {r.deals ?? "—"}
                            {m.closeRate !== null && <div className="text-[13px] text-ink-3">{pct(m.closeRate, 0)} fecharam</div>}
                          </td>
                          <td className="td num text-right">{r.revenue == null ? "—" : brl(r.revenue)}</td>
                          <td className="td num text-right">{m.costPerLead === null ? "—" : brl(m.costPerLead)}</td>
                          <td className="td num text-right">{m.costPerDeal === null ? "—" : brl(m.costPerDeal)}</td>
                          <td className="td num text-right">{m.returnPerReal === null ? "—" : `${brl(m.returnPerReal)} por R$ 1`}</td>
                          <td className="td num pr-5 text-right">
                            {ads.conversions > 0 ? conv(ads.conversions) : "—"}
                            {m.measuredShare !== null && Math.abs(m.measuredShare - 1) > 0.3 && (
                              <div className="text-[13px] text-ink-2">
                                {m.measuredShare > 1 ? "Google conta mais cliques do que chegam conversas" : "Chegam mais conversas do que o Google conta"}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="max-w-3xl">
              <ResultForm clientId={client.id} saved={saved} defaultMonth={resultMonth} maxMonth={thisMonth} />
            </div>
          </section>

          <div id="relatorios" className="mt-12 grid scroll-mt-32 gap-10 lg:grid-cols-2">
            <section>
              <h2 className="mb-3 text-[22px] font-semibold">Relatórios mensais</h2>
              {months.length === 0 ? (
                <p className="text-sm text-ink-2">Os relatórios aparecem aqui quando houver dados.</p>
              ) : (
                <ul className="divide-y divide-line border-y border-line text-sm">
                  {months.slice(0, 12).map((m) => (
                    <li key={m} className="flex items-center justify-between py-2.5">
                      <span className="first-letter:uppercase">{monthLabel(m)}</span>
                      <Link href={`/r/${client.reportToken}/${m}`} target="_blank" className="tap px-1 underline underline-offset-4">Abrir</Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h2 className="mb-3 text-[22px] font-semibold">Alertas já resolvidos</h2>
              {resolved.length === 0 ? (
                <p className="text-sm text-ink-2">Nenhum alerta resolvido até agora.</p>
              ) : (
                <ul className="divide-y divide-line border-y border-line text-sm">
                  {resolved.slice(0, 10).map((a) => (
                    <li key={a.id} className="py-2.5">
                      <div className="flex justify-between gap-4">
                        <span className="font-medium">{ALERT_LABELS[a.type as AlertType] ?? a.type}</span>
                        <span className="num shrink-0 text-ink-3">
                          {dateTime(a.firstSeenAt, user.timezone)} até {a.resolvedAt ? dateTime(a.resolvedAt, user.timezone) : "—"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{a.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
