import { eq } from "drizzle-orm";
import { beforeAll, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db";
import { users, workspaces } from "@/db/schema";
import { checkLogin, signUp } from "@/lib/auth/login";

let db: Db;
beforeAll(async () => {
  db = await createPgliteDb("memory");
});

const base = { name: "Morôni", workspaceName: "Solid Solutions", password: "senha-bem-longa" };

it("cadastro cria a conta com área própria e o login funciona", async () => {
  const r = await signUp(db, { ...base, email: " Moroni@Exemplo.com " }, "1.1.1.1");
  expect(r.ok).toBe(true);
  expect(await checkLogin(db, "moroni@exemplo.com", "senha-bem-longa")).toMatchObject({ ok: true });
  const [u] = await db.select().from(users).where(eq(users.email, "moroni@exemplo.com"));
  expect(u.passwordHash).not.toContain("senha");
});

it("cada cadastro ganha um workspace separado", async () => {
  const r = await signUp(db, { ...base, email: "outra@agencia.com", workspaceName: "Outra Agência" }, "2.2.2.2");
  expect(r.ok).toBe(true);
  const all = await db.select().from(users);
  expect(new Set(all.map((u) => u.workspaceId)).size).toBe(all.length);
  expect((await db.select().from(workspaces)).map((w) => w.name).sort()).toEqual(["Outra Agência", "Solid Solutions"]);
});

it("recusa e-mail repetido sem mexer na senha da conta que já existe", async () => {
  const r = await signUp(db, { ...base, email: "MORONI@exemplo.com", password: "outra-senha-longa" }, "3.3.3.3");
  expect(r).toEqual({ ok: false, reason: "email_taken" });
  expect(await checkLogin(db, "moroni@exemplo.com", "senha-bem-longa")).toMatchObject({ ok: true });
});

it("recusa dados inválidos com o motivo", async () => {
  expect(await signUp(db, { ...base, email: "sem-arroba" }, "4.4.4.4")).toEqual({ ok: false, reason: "invalid_email" });
  expect(await signUp(db, { ...base, email: "a@b.co", password: "curta" }, "4.4.4.4")).toEqual({ ok: false, reason: "weak_password" });
  expect(await signUp(db, { ...base, email: "a@b.co", name: " " }, "4.4.4.4")).toEqual({ ok: false, reason: "missing_name" });
  expect(await db.select().from(workspaces)).toHaveLength(2);
});

it("limita cadastros seguidos do mesmo endereço", async () => {
  const now = new Date("2026-11-16T12:00:00Z");
  for (let i = 0; i < 5; i++) expect((await signUp(db, { ...base, email: `l${i}@x.com` }, "9.9.9.9", now)).ok).toBe(true);
  expect(await signUp(db, { ...base, email: "l5@x.com" }, "9.9.9.9", now)).toEqual({ ok: false, reason: "rate_limited" });
  const later = new Date(now.getTime() + 61 * 60_000);
  expect((await signUp(db, { ...base, email: "l5@x.com" }, "9.9.9.9", later)).ok).toBe(true);
});
