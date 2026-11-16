import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignTable } from "@/components/CampaignTable";
import { DailyCharts } from "@/components/DailyCharts";
import { Kpis } from "@/components/Kpis";
import { PrintButton } from "@/components/PrintButton";
import { getDb } from "@/db";
import { workspaces } from "@/db/schema";
import { getClientByReportToken } from "@/lib/clients";
import { isMonthKey, todayInTz } from "@/lib/dates";
import { fullDate, monthLabel, monthName } from "@/lib/format";
import { monthsWithData } from "@/lib/metrics";
import { buildMonthlyReport } from "@/lib/report";

export const metadata: Metadata = { title: "Relatório de anúncios", robots: { index: false, follow: false } };

export default async function ReportPage(props: PageProps<"/r/[token]/[month]">) {
  const { token, month } = await props.params;
  if (!isMonthKey(month)) notFound();
  const db = await getDb();
  const client = await getClientByReportToken(db, token);
  if (!client) notFound();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, client.workspaceId));
  const today = todayInTz(ws.timezone);

  const [report, months] = await Promise.all([
    buildMonthlyReport(db, client, month, today),
    monthsWithData(db, client.id),
  ]);
  if (!report || !months.includes(month)) notFound();

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
        </section>

        <div className="mt-10">
          <Kpis
            totals={report.totals}
            previous={report.prevTotals}
            prevLabel={report.partial ? `mesmos dias de ${monthName(report.prevMonth)}` : monthLabel(report.prevMonth)}
          />
        </div>

        <div className="mt-6"><DailyCharts daily={report.daily} /></div>

        <section className="avoid-break">
          <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight">Resultado por campanha</h2>
          <CampaignTable campaigns={report.campaigns} showStatus={false} />
        </section>

        <dl className="avoid-break mt-10 grid max-w-[80ch] gap-x-10 gap-y-4 text-sm leading-relaxed sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Conversão</dt>
            <dd className="text-ink-2">Cada contato gerado pelos anúncios e registrado pela medição da conta, como um clique no botão do WhatsApp ou um formulário enviado.</dd>
          </div>
          <div>
            <dt className="font-semibold">Custo por conversão</dt>
            <dd className="text-ink-2">Quanto foi investido, em média, para gerar cada contato: o investimento dividido pelo número de conversões.</dd>
          </div>
          <div>
            <dt className="font-semibold">Impressões</dt>
            <dd className="text-ink-2">Quantas vezes os anúncios apareceram nas buscas do Google.</dd>
          </div>
          <div>
            <dt className="font-semibold">Investido</dt>
            <dd className="text-ink-2">Valor cobrado pelo Google pelos cliques nos anúncios. Não inclui a gestão das campanhas.</dd>
          </div>
        </dl>

        <footer className="mt-12 border-t border-line pt-4 text-[13px] text-ink-3">
          Preparado por Solid Solutions com dados do Google Ads. Gerado em {fullDate(today)}.
        </footer>
      </main>
    </div>
  );
}
