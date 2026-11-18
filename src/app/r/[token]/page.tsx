import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ReportBlocked } from "@/components/ReportBlocked";
import { getDb } from "@/db";
import { workspaces } from "@/db/schema";
import { reportIsOpen } from "@/lib/access";
import { todayInTz } from "@/lib/dates";
import { getClientByReportToken } from "@/lib/clients";
import { monthsWithData } from "@/lib/metrics";

/** Link curto do relatório: abre o mês fechado mais recente (ou o atual, se for o único). */
export default async function ReportIndex(props: PageProps<"/r/[token]">) {
  const { token } = await props.params;
  const db = await getDb();
  const client = await getClientByReportToken(db, token);
  if (!client) notFound();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, client.workspaceId));
  if (!reportIsOpen(client, todayInTz(ws.timezone))) return <ReportBlocked />;
  const months = await monthsWithData(db, client.id);
  if (months.length === 0) notFound();
  redirect(`/r/${token}/${months[1] ?? months[0]}`);
}
