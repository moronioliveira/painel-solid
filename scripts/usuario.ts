/**
 * Cria o usuário do painel ou troca a senha de um que já existe.
 *   npm run usuario -- email@exemplo.com "senha com 10+ caracteres" "Nome"
 */
import { closeDb, getDb } from "@/db";
import { upsertUser } from "@/lib/auth/login";

async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Uso: npm run usuario -- email@exemplo.com "senha" "Nome"');
    process.exit(1);
  }
  const db = await getDb();
  const { created } = await upsertUser(db, { email, password, name });
  console.log(created ? `Usuário ${email} criado.` : `Senha de ${email} atualizada.`);
  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await closeDb();
  process.exit(1);
});
