/**
 * Teste rápido do painel publicado: npm run smoke -- https://painel-solid.vercel.app
 * Roda sozinho no GitHub depois de cada publicação em produção (.github/workflows/smoke.yml).
 * Só lê páginas públicas; não usa login nem altera nada.
 */
const base = (process.argv[2] || process.env.SMOKE_URL || "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Uso: npm run smoke -- https://endereco-do-painel");
  process.exit(2);
}

const TIMEOUT = 20_000;
let failures = 0;

async function check(name, path, init, expect) {
  const started = Date.now();
  try {
    const res = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT), ...init });
    const text = await res.text();
    const problem = expect(res, text);
    const ms = Date.now() - started;
    if (problem) {
      failures++;
      console.log(`FALHOU  ${name} (${ms} ms): ${problem}`);
    } else console.log(`ok      ${name} (${ms} ms)`);
  } catch (err) {
    failures++;
    const why = err?.name === "TimeoutError" ? `sem resposta em ${TIMEOUT / 1000} s` : String(err?.message ?? err);
    console.log(`FALHOU  ${name}: ${why}`);
  }
}

const status = (want) => (res) => (res.status === want ? null : `esperava ${want}, veio ${res.status}`);

await check("banco respondendo a consultas simultâneas", "/api/health", {}, (res, text) =>
  res.status === 200 && text.includes('"ok":true') ? null : `status ${res.status}: ${text.slice(0, 120)}`,
);
await check("tela de login", "/login", {}, status(200));
await check("demonstração pública", "/demo", {}, (res, text) =>
  res.status !== 200 ? `status ${res.status}` : text.includes("Exemplo com dados fictícios") ? null : "texto da demonstração não apareceu",
);
await check("painel sem login manda para o login", "/", {}, (res) =>
  res.status === 307 && (res.headers.get("location") || "").endsWith("/login") ? null : `status ${res.status}`,
);
await check("link de relatório inexistente", "/r/link-que-nao-existe-123456", {}, status(404));
await check("envio do script sem chave é recusado", "/api/ingest", { method: "POST", body: "{}" }, status(401));

if (failures) {
  console.log(`\n${failures} verificação(ões) falharam em ${base}`);
  process.exit(1);
}
console.log(`\nTudo certo em ${base}`);
