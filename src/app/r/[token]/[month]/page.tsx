import { and, eq, gte, lte } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportBlocked } from "@/components/ReportBlocked";
import { ReportView } from "@/components/ReportView";
import { getDb } from "@/db";
import { dailyMetrics, searchTerms, workspaces } from "@/db/schema";
import { reachSentence, searchTermSummary, topTermsSentence, weightedReach } from "@/lib/ads-extras";
import { reportIsOpen } from "@/lib/access";
import { getClientByReportToken } from "@/lib/clients";
import { isMonthKey, monthEnd, todayInTz } from "@/lib/dates";
import { monthsWithData } from "@/lib/metrics";
import { buildMonthlyReport } from "@/lib/report";
import { businessItems, listResults, resultSummary } from "@/lib/results";

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
  const index = months.indexOf(month);
  const newer = months[index - 1];
  const older = months[index + 1];

  return (
    <ReportView
      clientName={client.name}
      month={month}
      report={report}
      extraLines={extraLines}
      resultLine={result ? resultSummary(report.totals, result) : null}
      bizItems={result ? businessItems(report.totals, result) : []}
      today={today}
      older={older ? { month: older, href: `/r/${token}/${older}` } : undefined}
      newer={newer ? { month: newer, href: `/r/${token}/${newer}` } : undefined}
    />
  );
}
