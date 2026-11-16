import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { loginAttempts, users, workspaces } from "@/db/schema";
import { hashPassword, MIN_PASSWORD, verifyPassword } from "./password";

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 8;

export type LoginResult = { ok: true; userId: string } | { ok: false; reason: "invalid" | "locked" };

export async function checkLogin(db: Db, emailRaw: string, password: string, now = new Date()): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const since = new Date(now.getTime() - WINDOW_MS);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), gte(loginAttempts.createdAt, since)));
  if (n >= MAX_FAILURES) return { ok: false, reason: "locked" };

  const [user] = await db.select().from(users).where(eq(users.email, email));
  // Verifica um hash mesmo sem usuário, para a resposta levar o mesmo tempo.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await db.insert(loginAttempts).values({ email: email.slice(0, 320), createdAt: now });
    await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(now.getTime() - 24 * 3_600_000)));
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, userId: user.id };
}

const DUMMY_HASH =
  "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

/** Cria o usuário (e o workspace, se for o primeiro) ou troca a senha de um que já existe. */
export async function upsertUser(
  db: Db,
  input: { email: string; password: string; name?: string; workspaceName?: string },
): Promise<{ created: boolean; userId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
  if (input.password.length < MIN_PASSWORD) throw new Error(`A senha precisa de pelo menos ${MIN_PASSWORD} caracteres.`);
  const passwordHash = await hashPassword(input.password);

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    await db.update(users).set({ passwordHash, ...(input.name ? { name: input.name } : {}) }).where(eq(users.id, existing.id));
    return { created: false, userId: existing.id };
  }
  let [ws] = await db.select().from(workspaces).limit(1);
  if (!ws) [ws] = await db.insert(workspaces).values({ name: input.workspaceName ?? "Solid Solutions" }).returning();
  const [user] = await db
    .insert(users)
    .values({ workspaceId: ws.id, email, name: input.name ?? email.split("@")[0], passwordHash })
    .returning();
  return { created: true, userId: user.id };
}
