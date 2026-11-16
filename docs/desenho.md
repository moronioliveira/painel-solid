# Painel Solid — desenho (aprovado em 16/11/2026)

## Para que serve

Ver todos os clientes de Google Ads da Solid Solutions num lugar só, ser avisado
quando algo sai do trilho e gerar o relatório mensal sem trabalho manual.
O painel **só lê** dados: nunca altera campanhas.

## Caminhos considerados

| Caminho | Como funciona | Por que sim / por que não |
|---|---|---|
| A. Planilha + Looker Studio | Script joga dados numa planilha | Rápido e grátis, mas o visual não é nosso e não vira produto |
| **B. App próprio com dados enviados (escolhido)** | Script do Google Ads envia os números para o painel; CSV como reserva | Controle total, sem esperar aprovação do Google |
| C. App próprio com a API oficial | Painel busca os dados sozinho | Exige developer token aprovado; fica para depois |

O caminho B foi escolhido pelo Morôni. A entrada de dados fica isolada em
`src/lib/ingest.ts`, então a API oficial (C) pode ser ligada depois sem refazer o resto.

## Como os dados entram

- Um script roda todo dia na conta de Ads de cada cliente e faz `POST /api/ingest`
  com uma chave secreta própria daquele cliente.
- Cada envio traz os últimos 30 dias e **substitui** esse período no banco
  (o Google corrige conversões com atraso).
- Reserva: importar o relatório de campanhas exportado em CSV, na tela de configuração.

## Telas

1. **Visão geral** (`/`): uma linha por cliente — gasto do mês, verba, conversões,
   custo por lead, variação contra o mês anterior, sinal verde/amarelo/vermelho.
2. **Cliente** (`/clientes/[id]`): gráficos por dia, tabela por campanha, histórico de alertas.
3. **Alertas** (`/alertas`): lista única do que precisa de atenção.
4. **Relatório mensal** (`/r/[token]/[aaaa-mm]`): link só de leitura, sem login,
   com resumo em linguagem simples; salva em PDF pelo navegador.
5. **Configuração do cliente** (`/clientes/[id]/config`): verba mensal, meta de custo
   por lead, chave, script pronto para copiar, importação de CSV.

## Alertas

| Alerta | Atenção (amarelo) | Crítico (vermelho) |
|---|---|---|
| Verba acabando | projeção do mês ≥ 110% da verba | projeção ≥ 125% ou verba já atingida |
| Verba sobrando | projeção ≤ 75% da verba | — |
| Sem conversão | 5 dias seguidos com gasto e zero conversão | 10 dias |
| Custo por lead acima da meta | últimos 14 dias ≥ 120% da meta | ≥ 150% |
| Campanha sem impressões | campanha ativa com 3 dias sem impressão | — |
| Script parou de enviar | sem dados há 36 h | 72 h |

Os números ficam em `src/lib/alerts/thresholds.ts` (escolha do Claude, ajustável).

## Dados separados por cliente

Toda tabela carrega `workspace_id` (o dono da conta) e, quando faz sentido, `client_id`.
Hoje existe um workspace só. Vender como software depois = criar outros workspaces.
Toda consulta passa pelo workspace do usuário logado.

## Escolhas técnicas (do Claude, ajustáveis)

- Next.js 16 + TypeScript + Tailwind 4, deploy na Vercel.
- Banco Postgres (Supabase em produção) via Drizzle. Sem `DATABASE_URL`, o app usa
  um Postgres embutido em arquivo (PGlite) para rodar no computador sem configurar nada.
- **Login próprio simples** (e-mail e senha, sessão em cookie assinado) em vez do login
  do Supabase: funciona local sem configuração e é testável. Não tem "esqueci a senha";
  a senha é trocada pelo comando `npm run usuario`. Trocar pelo Supabase Auth é
  possível quando houver outros usuários.
- Só o gestor faz login. O cliente final recebe apenas o link do relatório.
- Alertas aparecem no painel; aviso por e-mail/WhatsApp fica para depois.

## Fora da primeira versão

API oficial do Google Ads, cobrança, login para clientes, outras plataformas de
anúncio, envio automático de avisos e qualquer alteração em campanhas.
