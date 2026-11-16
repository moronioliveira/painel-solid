# Painel Solid

Painel de clientes de Google Ads da Solid Solutions: visão geral de todos os clientes,
alertas automáticos e relatório mensal com link de leitura. O desenho aprovado está em
[`docs/desenho.md`](docs/desenho.md).

## Rodar no computador

Precisa do Node.js 20 ou mais novo.

```bash
npm install
npm run demo     # cria 6 clientes de exemplo e o usuário de teste
npm run dev      # abre em http://localhost:3000
```

Login de teste: `demo@painel.local` / `painel-demo-123`.

Sem configurar nada, o painel usa um Postgres embutido gravado em `.data/`.
Pare o `npm run dev` antes de rodar `npm run demo` ou `npm run usuario`: os dois
não podem abrir o banco local ao mesmo tempo.

Para apagar os exemplos: `npm run demo -- limpar`.
Para criar o seu usuário (ou trocar a senha):

```bash
npm run usuario -- voce@email.com "uma senha com 10+ caracteres" "Seu Nome"
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes (regras de alerta, CSV, envio de dados, login, relatório, separação por workspace) |
| `npm run typecheck` / `npm run lint` | Conferência de tipos e de estilo |
| `npm run build` | Build de produção |
| `npm run db:generate` | Gera uma migração depois de mudar `src/db/schema.ts` |
| `npm run db:migrate` | Aplica as migrações no Postgres de produção |

## Publicar (Vercel + Supabase)

O script do Google Ads só consegue enviar dados para um endereço público, então o
painel precisa estar publicado para o envio diário funcionar.

1. Crie um projeto no Supabase e copie a *connection string* do Postgres
   (use a do pooler, modo "transaction").
2. No seu computador, aplique o banco e crie seu usuário apontando para o Supabase:
   ```bash
   DATABASE_URL="postgres://..." npm run db:migrate
   DATABASE_URL="postgres://..." npm run usuario -- voce@email.com "senha" "Nome"
   ```
   No Windows (PowerShell): `$env:DATABASE_URL="postgres://..."; npm run db:migrate`
3. Suba o projeto para o GitHub e importe na Vercel com estas variáveis:
   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | a connection string do Supabase |
   | `SESSION_SECRET` | um texto aleatório com 32+ caracteres |
   | `APP_URL` | o endereço público, ex.: `https://painel.seudominio.com.br` |
4. Abra o painel publicado, cadastre o cliente e copie o script da tela de configuração.

O caminho com Postgres de verdade foi testado aqui com um Postgres 16 local.
A publicação na Vercel e no Supabase em si ainda não foi feita.

## Como os dados entram

- **Script (automático):** cada cliente tem uma chave. O script da tela de configuração
  roda todo dia na conta do cliente e faz `POST /api/ingest` com os últimos 30 dias.
  O período enviado substitui o que havia no banco, então reenviar nunca duplica.
- **CSV (manual):** na tela de configuração, para histórico antigo ou cliente sem script.

O script nunca foi executado numa conta real do Google Ads: ele foi testado com uma
imitação das funções do Google (`AdsApp`, `UrlFetchApp`). Confira a primeira execução
real nos registros do Google Ads.

## Onde fica cada coisa

```
src/db/schema.ts            tabelas (tudo com workspace_id)
src/lib/ingest.ts           validação e gravação dos envios
src/lib/csv.ts              leitura do CSV exportado do Google Ads
src/lib/alerts/             regras (evaluate.ts), limites (thresholds.ts), gravação (sync.ts)
src/lib/report.ts           relatório mensal e resumo em texto
src/lib/ads-script.ts       gerador do script do Google Ads
src/lib/auth/               senha, sessão e login
src/app/(app)/              telas do painel (exigem login)
src/app/r/[token]/          relatório público por link
src/app/api/ingest/         recebimento dos dados
tests/                      testes automatizados
```

Para deixar os alertas mais ou menos sensíveis, mude `src/lib/alerts/thresholds.ts`.

## Limites conhecidos desta versão

- Login só com e-mail e senha, sem "esqueci a senha" (troque pelo `npm run usuario`).
- Os alertas aparecem no painel; não há aviso por e-mail ou WhatsApp.
- O alerta "script parou" é reavaliado quando alguém abre o painel.
- Só tema claro.
- Quem tem o link do relatório vê todos os meses daquele cliente.
