import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { clients, type Client } from "@/db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cliente do workspace do usuário. Nunca busque cliente só pelo id. */
export async function getClient(db: Db, workspaceId: string, id: string): Promise<Client | null> {
  if (!UUID.test(id)) return null;
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.workspaceId, workspaceId)));
  return client ?? null;
}

export async function getClientByReportToken(db: Db, token: string): Promise<Client | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [client] = await db.select().from(clients).where(eq(clients.reportToken, token));
  return client ?? null;
}
