import { and, eq, gte, lte } from "drizzle-orm";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignTable } from "@/components/CampaignTable";
import { DailyCharts } from "@/components/DailyCharts";
import { Kpis } from "@/components/Kpis";
import { PrintButton } from "@/components/PrintButton";
import { ReportBlocked } from "@/components/ReportBlocked";
import { getDb } from "@/db";
import { dailyMetrics, searchTerms, workspaces } from "@/db/schema";
import { reachSentence, searchTermSummary, topTermsSentence, weightedReach } from "@/lib/ads-extras";
import { reportIsOpen } from "@/lib/access";
import { getClientByReportToken } from "@/lib/clients";
import { isMonthKey, monthEnd, todayInTz } from "@/lib/dates";
import { brl, fullDate, monthLabel, monthName, pct } from "@/lib/format";
import { monthsWithData } from "@/lib/metrics";
import { buildMonthlyReport } from "@/lib/report";
import { businessMetrics, listResults, resultSummary } from "@/lib/results";

export const metadata: Metadata = { title: "Relatório de anúncios", robots: { index: false, follow: false } };

export default async function ReportPage(props: PageProps<"/r/[token]/[month]">) {
  const { token, month } = await props.params;
  if (!isMonthKey(month)) notFound();
  const db = await getDb();
  const client = await getClientByReportToken(db, token);
  if (!client) notFound();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, client.workspaceId));
  const today = todayInTz(ws.timezone);
  if (!reportIsOpen(client, today)) return <ReportBlocked />;

  const monthEndDay = monthEnd(month);
  const [report, months, results, reachRows, termRows] = await Promise.all([
    buildMonthlyReport(db, client, month, today),
    monthsWithData(db, client.id),
    listResults(db, client.workspaceId, client.id),
    db
      .select({ impressions: dailyMetrics.impressions, impressionShare: dailyMetrics.impressionShare, lostBudgetShare: dailyMetrics.lostBudgetShare, lostRankShare: dailyMetrics.lostRankShare })
      .from(dailyMetrics)
      .where(and(eq(dailyMetrics.clientId, client.id), gte(dailyMetrics.date, `${month}-01`), lte(dailyMetrics.date, monthEndDay))),
    db
      .select({ term: searchTerms.term, impressions: searchTerms.impressions, clicks: searchTerms.clicks, cost: searchTerms.cost, conversions: searchTerms.conversions })
      .from(searchTerms)
      .where(and(eq(searchTerms.clientId, client.id), gte(searchTerms.date, `${month}-01`), lte(searchTerms.date, monthEndDay))),
  ]);
  const extraLines = [reachSentence(weightedReach(reachRows)), topTermsSentence(searchTermSummary(termRows))].filter((x): x is string => !!x);
  if (!report || !months.includes(month)) notFound();

  const result = results.find((r) => r.month === month) ?? null;
  const resultLine = result ? resultSummary(report.totals, result) : null;
  const biz = result ? businessMetrics(report.totals, result) : null;
  const bizItems = result && biz
    ? [
        { label: "Conversas que chegaram", value: result.leads == null ? null : result.leads.toLocaleString("pt-BR"), note: biz.costPerLead === null ? undefined : `${brl(biz.costPerLead)} de anúncio por conversa` },
        { label: "Contratos fechados", value: result.deals == null ? null : result.deals.toLocaleString("pt-BR"), note: biz.closeRate === null ? undefined : `${pct(biz.closeRate, 0)} das conversas` },
        { label: "Receita dos contratos", value: result.revenue == null ? null : brl(result.revenue), note: biz.costPerDeal === null ? undefined : `${brl(biz.costPerDeal)} de anúncio por contrato` },
        { label: "Retorno", value: biz.returnPerReal === null ? null : brl(biz.returnPerReal), note: biz.returnPerReal === null ? undefined : "em receita para cada R$ 1 investido em anúncios" },
      ].filter((i) => i.value !== null)
    : [];
  const index = months.indexOf(month);
  const newer = months[index - 1];
  const older = months[index + 1];

  return (
    <div className="min-h-screen bg-white">
      <header className="print-exact bg-black text-white">
        <div className="mx-auto flex max-w-[960px] items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Image src="/simbolo-solid.png" alt="" width={36} height={32} priority />
            <span className="text-[15px] font-semibold tracking-tight">Solid Solutions</span>
          </div>
          <span className="text-sm text-white/70">Relatório de anúncios no Google</span>
        </div>
        <div className="brand-rule print-exact" />
      </header>

      <main className="mx-auto max-w-[960px] px-6 py-10">
        <div className="no-print mb-8 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex gap-4">
            {older && <Link href={`/r/${token}/${older}`} className="underline underline-offset-2">Mês anterior ({monthName(older)})</Link>}
            {newer && <Link href={`/r/${token}/${newer}`} className="underline underline-offset-2">Mês seguinte ({monthName(newer)})</Link>}
          </div>
          <PrintButton />
        </div>

        <p className="text-sm text-ink-2">{client.name}</p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight first-letter:uppercase">{monthLabel(month)}</h1>
        {report.partial && (
          <p className="mt-2 text-sm text-ink-2">Mês em andamento: os números vão de {fullDate(report.from)} a {fullDate(report.to)}.</p>
        )}

        <section className="mt-8 max-w-[68ch] space-y-3 text-[17px] leading-relaxed" aria-label="Resumo">
          {report.summary.map((s) => (
            <p key={s}>{s}</p>
          ))}
          {extraLines.map((s) => (
            <p key={s}>{s}</p>
          ))}
          {resultLine && <p>{resultLine}</p>}
        </section>

        <div className="mt-10">
          <Kpis
            totals={report.totals}
            previous={report.prevTotals}
            prevLabel={report.partial ? `os mesmos dias de ${monthName(report.prevMonth)}` : monthLabel(report.prevMonth)}
            audience="client"
          />
        </div>

        {bizItems.length > 0 && (
          <section className="avoid-break mt-10" aria-labelledby="negocio">
            <h2 id="negocio" className="mb-3 text-lg font-semibold tracking-tight">Resultado no negócio</h2>
            <dl className="print-exact grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4 print:grid-cols-4">
              {bizItems.map((i) => (
                <div key={i.label} className="bg-surface px-5 py-4 print:px-3">
                  <dt className="text-sm text-ink-2">{i.label}</dt>
                  <dd className="num mt-1 text-2xl font-semibold tracking-tight">{i.value}</dd>
                  {i.note && <dd className="mt-1 text-[13px] text-ink-2">{i.note}</dd>}
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[13px] text-ink-3">Números informados pelo seu atendimento.</p>
          </section>
        )}

        <div className="mt-6"><DailyCharts daily={report.daily} audience="client" /></div>

        <section className="avoid-break">
          <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">Resultado por campanha</h2>
          <CampaignTable campaigns={report.campaigns} showStatus={false} audience="client" />
        </section>

        <section className="avoid-break mt-12" aria-labelledby="glossario">
          <h2 id="glossario" className="mb-3 text-lg font-semibold tracking-tight">O que cada número quer dizer</h2>
          <dl className="grid max-w-[80ch] gap-x-10 gap-y-4 text-sm leading-relaxed sm:grid-cols-2">
            <div>
              <dt className="font-semibold">Investido</dt>
              <dd className="text-ink-2">O que o Google cobrou pelos anúncios. O Google só cobra quando alguém clica no anúncio. Não inclui o valor da gestão.</dd>
            </div>
            <div>
              <dt className="font-semibold">Contatos</dt>
              <dd className="text-ink-2">Quantas vezes alguém que veio de um anúncio clicou no botão para falar com você, como o do WhatsApp. Nem todo clique vira conversa: a pessoa pode desistir antes de enviar a mensagem.</dd>
            </div>
            <div>
              <dt className="font-semibold">Custo por contato</dt>
              <dd className="text-ink-2">Quanto custou, em média, cada contato: o valor investido dividido pelo número de contatos. Quanto menor, melhor.</dd>
            </div>
            <div>
              <dt className="font-semibold">Visitas ao site</dt>
              <dd className="text-ink-2">Quantas pessoas clicaram no anúncio e entraram no seu site.</dd>
            </div>
            <div>
              <dt className="font-semibold">Vezes que apareceu</dt>
              <dd className="text-ink-2">Quantas vezes os anúncios apareceram para quem pesquisou no Google.</dd>
            </div>
            {bizItems.length > 0 && (
              <div>
                <dt className="font-semibold">Retorno</dt>
                <dd className="text-ink-2">Quanto entrou em receita para cada R$ 1 investido em anúncios. Acima de R$ 1, a receita foi maior do que o valor investido em anúncios.</dd>
              </div>
            )}
          </dl>
        </section>

        <footer className="mt-12 border-t border-line pt-4 text-[13px] text-ink-3">
          Preparado por Solid Solutions com dados do Google Ads. Gerado em {fullDate(today)}.
        </footer>
      </main>
    </div>
  );
}
