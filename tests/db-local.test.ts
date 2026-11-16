import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, expect, it } from "vitest";
import { createPgliteDb } from "@/db";

const dirs: string[] = [];
function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "painel-db-"));
  dirs.push(d);
  return path.join(d, "pglite");
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

it("abre, migra, fecha e reabre a mesma pasta", async () => {
  const dir = tmpDir();
  const a = await createPgliteDb(dir);
  await a.close();
  expect(fs.existsSync(`${dir}.lock`)).toBe(false);
  const b = await createPgliteDb(dir);
  await b.close();
});

it("recusa abrir a pasta quando outro processo vivo está com ela", async () => {
  const dir = tmpDir();
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.writeFileSync(`${dir}.lock`, String(process.ppid));
  await expect(createPgliteDb(dir)).rejects.toThrow(/já está aberto em outro processo/);
});

it("ignora trava deixada por um processo que já terminou", async () => {
  const dir = tmpDir();
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.writeFileSync(`${dir}.lock`, "999999");
  const db = await createPgliteDb(dir);
  await db.close();
});

it("explica o que fazer quando a pasta do banco está corrompida", async () => {
  const dir = tmpDir();
  const pg = new PGlite(dir);
  await pg.waitReady;
  await pg.close();
  fs.rmSync(path.join(dir, "global", "pg_control"));
  await expect(createPgliteDb(dir)).rejects.toThrow(/corrompida/);
  expect(fs.existsSync(`${dir}.lock`)).toBe(false);
});
