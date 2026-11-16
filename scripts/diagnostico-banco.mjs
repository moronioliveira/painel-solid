// Abre o banco embutido (PGlite) fora do Next.js e mostra o erro verdadeiro, se houver.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

console.log("Node:", process.version, "| Sistema:", process.platform, os.release());
const dir = path.join(os.tmpdir(), "painel-diagnostico-" + Date.now());
try {
  const { PGlite } = await import("@electric-sql/pglite");
  for (const alvo of ["memoria", "disco"]) {
    const db = new PGlite(alvo === "memoria" ? undefined : dir);
    await db.waitReady;
    const r = await db.query("select 1 as ok");
    console.log(`PGlite em ${alvo}: OK`, r.rows[0]);
    await db.close();
  }
} catch (e) {
  console.log("FALHOU:", e);
  if (e?.cause) console.log("CAUSA:", e.cause);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

const data = path.join(process.cwd(), ".data", "pglite");
console.log("Pasta .data/pglite existe?", fs.existsSync(data));
if (fs.existsSync(data)) console.log("Arquivos:", fs.readdirSync(data).slice(0, 15));
