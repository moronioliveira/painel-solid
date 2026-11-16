import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db";
import { getClientByReportToken } from "@/lib/clients";
import { monthsWithData } from "@/lib/metrics";

/** Link curto do relatório: abre o mês fechado mais recente (ou o atual, se for o único). */
export default async function ReportIndex(props: PageProps<"/r/[token]">) {
  const { token } = await props.params;
  const db = await getDb();
  const client = await getClientByReportToken(db, token);
  if (!client) notFound();
  const months = await monthsWithData(db, client.id);
  if (months.length === 0) notFound();
  redirect(`/r/${token}/${months[1] ?? months[0]}`);
}
