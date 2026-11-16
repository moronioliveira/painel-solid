import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { clients, type Client } from "@/db/schema";
import { openAlerts } from "./alerts/sync";
import { dayOfMonth, daysInMonth } from "./dates";
import { totalsByClient, ZERO, type Totals } from "./metrics";
import { resolvePeriod, type Period } from "./periods";

export type OverviewRow = {
  client: Client;
  current: Totals;
  previous: Totals;
  alerts: Awaited<ReturnType<typeof openAlerts>>;
};

export async function loadOverview(db: Db, workspaceId: string, today: string) {
  const period: Period = resolvePeriod("mes", today);
  const [list, current, previous, alerts] = await Promise.all([
    db.select().from(clients).where(eq(clients.workspaceId, workspaceId)).orderBy(asc(clients.name)),
    totalsByClient(db, workspaceId, period.from, period.to),
    totalsByClient(db, workspaceId, period.prevFrom, period.prevTo),
    openAlerts(db, workspaceId),
  ]);
  const rows: OverviewRow[] = list
    .filter((c) => c.active)
    .map((client) => ({
      client,
      current: current.get(client.id) ?? { ...ZERO },
      previous: previous.get(client.id) ?? { ...ZERO },
      alerts: alerts.filter((a) => a.clientId === client.id),
    }));
  return {
    period,
    rows,
    archived: list.filter((c) => !c.active),
    /** Fração do mês que já passou, contando até ontem. */
    expectedShare: today.endsWith("-01") ? 0 : dayOfMonth(period.to) / daysInMonth(today),
  };
}
