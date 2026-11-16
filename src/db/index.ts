import fs from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
/** Banco local: igual ao Db, mais close() para liberar a pasta. */
export type LocalDb = Db & { close: () => Promise<void> };

const MIGRATIONS = path.join(process.cwd(), "drizzle");
const g = globalThis as { __painelDb?: Promise<Db> };

/**
 * Banco único do processo.
 * - Com DATABASE_URL: Postgres de verdade (Supabase). Rode `npm run db:migrate` a cada mudança de schema.
 * - Sem DATABASE_URL: Postgres embutido (PGlite) gravado em .data/pglite, migrado sozinho.
 */
export function getDb(): Promise<Db> {
  if (!g.__painelDb) {
    const p = createDb();
    // Se falhar, a próxima requisição tenta de novo em vez de repetir o mesmo erro para sempre.
    p.catch(() => {
      if (g.__painelDb === p) g.__painelDb = undefined;
    });
    g.__painelDb = p;
  }
  return g.__painelDb;
}

/** Fecha o banco do processo. Os comandos (demo, usuario) chamam antes de sair. */
export async function closeDb(): Promise<void> {
  const p = g.__painelDb;
  g.__painelDb = undefined;
  const db = (await p?.catch(() => undefined)) as Partial<LocalDb> | undefined;
  await db?.close?.();
}

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    // prepare:false é exigido pelo pooler do Supabase em modo "transaction".
    const sql = postgres(url, { prepare: false, max: 5 });
    return drizzle(sql, { schema }) as unknown as Db;
  }
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL não configurada. Em produção o painel precisa de um Postgres.");
  }
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  return createPgliteDb(dir);
}

/** Usado pelo modo local e pelos testes (dir = "memory" não grava em disco). */
export async function createPgliteDb(dir: string): Promise<LocalDb> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const onDisk = dir !== "memory";
  if (onDisk) {
    fs.mkdirSync(dir, { recursive: true });
    acquireLock(dir);
  }
  const client = new PGlite(onDisk ? dir : undefined);
  const close = async () => {
    try {
      if (!client.closed) await client.close();
    } finally {
      if (onDisk) releaseLock(dir);
    }
  };
  try {
    await client.waitReady;
  } catch (err) {
    if (onDisk) releaseLock(dir);
    throw new Error(
      `A pasta do banco local está corrompida e não abre: ${dir}\n` +
        `Pare o servidor, apague ou renomeie essa pasta e rode "npm run demo" ou "npm run usuario" para criar uma nova. ` +
        `Os dados que estavam nela se perdem.`,
      { cause: err },
    );
  }
  const db = drizzle(client, { schema });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS });
  } catch (err) {
    await close().catch(() => {});
    throw err;
  }
  return Object.assign(db as unknown as Db, { close });
}

/*
 * O banco embutido só aguenta um processo por pasta. Dois processos gravando juntos
 * (por exemplo "npm run demo" com o "npm run dev" aberto) podem corromper os arquivos.
 * A trava é um arquivo ao lado da pasta com o número do processo que está com ela.
 */
function lockPath(dir: string) {
  return `${dir.replace(/[\\/]+$/, "")}.lock`;
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function acquireLock(dir: string) {
  const file = lockPath(dir);
  if (fs.existsSync(file)) {
    const pid = Number(fs.readFileSync(file, "utf8").trim());
    if (pid && pid !== process.pid && isAlive(pid)) {
      throw new Error(
        `O banco local já está aberto em outro processo (número ${pid}).\n` +
          `Feche o "npm run dev" antes de rodar "npm run demo" ou "npm run usuario", e não abra o painel em dois terminais. ` +
          `Se nada estiver aberto, apague o arquivo ${file}.`,
      );
    }
  }
  fs.writeFileSync(file, String(process.pid));
  process.once("exit", () => releaseLock(dir));
}

function releaseLock(dir: string) {
  const file = lockPath(dir);
  try {
    if (Number(fs.readFileSync(file, "utf8").trim()) === process.pid)
      fs.unlinkSync(file);
  } catch {
    // trava já removida
  }
}

export { schema };
