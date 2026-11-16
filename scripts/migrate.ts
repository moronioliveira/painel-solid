/** Aplica as migrações no Postgres de produção: DATABASE_URL=... npm run db:migrate */
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Defina DATABASE_URL. (No modo local o banco embutido se migra sozinho.)");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, prepare: false });
  await migrate(drizzle(sql), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await sql.end();
  console.log("Banco atualizado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
