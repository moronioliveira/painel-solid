import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, workspaces } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Verificação de saúde para o teste pós-publicação. Faz várias consultas ao mesmo tempo,
 * como as telas fazem, e responde em até 10 s. Não devolve nenhum dado do banco.
 */
export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    const work = Promise.all([
      db.execute(sql`select 1`),
      db.select({ n: sql<number>`count(*)` }).from(workspaces),
      db.select({ n: sql<number>`count(*)` }).from(clients),
      ...Array.from({ length: 5 }, () => db.execute(sql`select now()`)),
    ]);
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("banco não respondeu em 10 s")), 10_000));
    await Promise.race([work, timeout]);
    return Response.json({ ok: true, ms: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Verificação de saúde falhou", err);
    return Response.json({ ok: false, ms: Date.now() - started }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
