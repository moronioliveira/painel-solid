import { beforeAll, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db";
import { checkLogin, upsertUser } from "@/lib/auth/login";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

let db: Db;
beforeAll(async () => {
  db = await createPgliteDb("memory");
  await upsertUser(db, { email: "Moroni@Exemplo.com", password: "senha-bem-longa", name: "Morôni" });
});

it("hash não guarda a senha e confere certo", async () => {
  const h = await hashPassword("senha-bem-longa");
  expect(h).not.toContain("senha");
  expect(await verifyPassword("senha-bem-longa", h)).toBe(true);
  expect(await verifyPassword("senha-bem-longA", h)).toBe(false);
  expect(await verifyPassword("x", "lixo")).toBe(false);
});

it("login ignora maiúsculas no e-mail; senha errada e usuário inexistente dão a mesma resposta", async () => {
  expect(await checkLogin(db, " moroni@exemplo.com ", "senha-bem-longa")).toMatchObject({ ok: true });
  expect(await checkLogin(db, "moroni@exemplo.com", "errada")).toEqual({ ok: false, reason: "invalid" });
  expect(await checkLogin(db, "ninguem@exemplo.com", "errada")).toEqual({ ok: false, reason: "invalid" });
});

it("trava depois de 8 erros em 15 minutos e destrava depois", async () => {
  const now = new Date("2026-11-16T12:00:00Z");
  for (let i = 0; i < 8; i++) await checkLogin(db, "alvo@exemplo.com", "x", now);
  expect(await checkLogin(db, "alvo@exemplo.com", "x", now)).toEqual({ ok: false, reason: "locked" });
  const later = new Date(now.getTime() + 16 * 60_000);
  expect(await checkLogin(db, "alvo@exemplo.com", "x", later)).toEqual({ ok: false, reason: "invalid" });
});

it("recusa senha curta e troca a senha de quem já existe", async () => {
  await expect(upsertUser(db, { email: "a@b.co", password: "curta" })).rejects.toThrow("10 caracteres");
  const r = await upsertUser(db, { email: "moroni@exemplo.com", password: "outra-senha-longa" });
  expect(r.created).toBe(false);
  expect(await checkLogin(db, "moroni@exemplo.com", "outra-senha-longa")).toMatchObject({ ok: true });
  expect(await checkLogin(db, "moroni@exemplo.com", "senha-bem-longa")).toMatchObject({ ok: false });
});
