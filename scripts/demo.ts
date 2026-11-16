/**
 * Dados de exemplo para ver o painel funcionando antes de ligar clientes reais.
 *   npm run demo           cria os clientes "(exemplo)"
 *   npm run demo -- limpar apaga só os clientes "(exemplo)"
 * Pare o servidor (npm run dev) antes de rodar no modo local.
 */
import { and, eq, like } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { clients, users, workspaces } from "@/db/schema";
import { syncAlerts } from "@/lib/alerts/sync";
import { upsertUser } from "@/lib/auth/login";
import { addDays, eachDay, todayInTz } from "@/lib/dates";
import { ingestForClient, ingestPayloadSchema } from "@/lib/ingest";
import { generateIngestKey, generateReportToken } from "@/lib/keys";

const SUFFIX = " (exemplo)";
const DEMO_EMAIL = "demo@painel.local";
const DEMO_PASSWORD = "painel-demo-123";

// Gerador previsível: os exemplos saem sempre parecidos.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

type Camp = { id: string; name: string; status?: string; cost: number; cpc: number; convRate: number; ctr: number; silentLastDays?: number };
type Demo = {
  name: string;
  budget: number | null;
  targetCpl: number | null;
  campaigns: Camp[];
  /** Há quantos dias o script parou de enviar (0 = em dia). */
  stoppedDaysAgo?: number;
  /** Dias finais sem nenhuma conversão. */
  noConvLastDays?: number;
  noData?: boolean;
};

const DEMOS: Demo[] = [
  {
    name: "Advocacia Trabalhista",
    budget: 900,
    targetCpl: 45,
    campaigns: [
      { id: "101", name: "Pesquisa | Rescisão indireta", cost: 21, cpc: 2.4, convRate: 0.085, ctr: 0.06 },
      { id: "102", name: "Pesquisa | Marca", cost: 6, cpc: 0.9, convRate: 0.12, ctr: 0.22 },
    ],
  },
  {
    name: "Clínica Odontológica",
    budget: 600,
    targetCpl: 30,
    campaigns: [{ id: "201", name: "Pesquisa | Implante dentário", cost: 33, cpc: 1.9, convRate: 0.09, ctr: 0.07 }],
  },
  {
    name: "Pet Shop Banho e Tosa",
    budget: 450,
    targetCpl: 20,
    noConvLastDays: 6,
    campaigns: [{ id: "301", name: "Pesquisa | Banho e tosa", cost: 14, cpc: 1.1, convRate: 0.1, ctr: 0.08 }],
  },
  {
    name: "Nutricionista Online",
    budget: 750,
    targetCpl: 25,
    campaigns: [
      { id: "401", name: "Pesquisa | Consulta online", cost: 24, cpc: 2.8, convRate: 0.07, ctr: 0.05 },
      { id: "402", name: "Pesquisa | Emagrecimento", cost: 5, cpc: 2.2, convRate: 0.05, ctr: 0.04, silentLastDays: 5 },
    ],
  },
  {
    name: "Imobiliária Centro",
    budget: 1200,
    targetCpl: 60,
    stoppedDaysAgo: 4,
    campaigns: [{ id: "501", name: "Pesquisa | Apartamentos à venda", cost: 38, cpc: 3.1, convRate: 0.06, ctr: 0.05 }],
  },
  { name: "Loja de Móveis Planejados", budget: 800, targetCpl: 50, noData: true, campaigns: [] },
];

async function main() {
  const db = await getDb();
  const mode = process.argv[2];

  let [ws] = await db.select().from(workspaces).limit(1);
  if (mode === "limpar") {
    if (ws) {
      const gone = await db
        .delete(clients)
        .where(and(eq(clients.workspaceId, ws.id), like(clients.name, `%${SUFFIX}`)))
        .returning({ id: clients.id });
      console.log(`${gone.length} clientes de exemplo apagados.`);
    }
    await closeDb();
    process.exit(0);
  }

  const anyUser = await db.select().from(users).limit(1);
  if (anyUser.length === 0) {
    await upsertUser(db, { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Morôni" });
    console.log(`Usuário de teste criado: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    [ws] = await db.select().from(workspaces).limit(1);
  }

  await db.delete(clients).where(and(eq(clients.workspaceId, ws.id), like(clients.name, `%${SUFFIX}`)));

  const now = new Date();
  const today = todayInTz(ws.timezone, now);
  const yesterday = addDays(today, -1);
  const from = addDays(today, -75);

  for (const [index, demo] of DEMOS.entries()) {
    const k = generateIngestKey();
    const [client] = await db
      .insert(clients)
      .values({
        workspaceId: ws.id,
        name: demo.name + SUFFIX,
        monthlyBudget: demo.budget,
        targetCpl: demo.targetCpl,
        ingestKeyHash: k.hash,
        ingestKeyHint: k.hint,
        reportToken: generateReportToken(),
      })
      .returning();
    if (demo.noData) continue;

    const rand = rng(index + 7);
    const to = addDays(yesterday, -(demo.stoppedDaysAgo ?? 0));
    const rows = [];
    for (const date of eachDay(from, to)) {
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const weekend = weekday === 0 || weekday === 6 ? 0.7 : 1;
      for (const c of demo.campaigns) {
        if (c.silentLastDays && date > addDays(to, -c.silentLastDays)) continue;
        const cost = c.cost * weekend * (0.8 + rand() * 0.4);
        const clicks = Math.max(1, Math.round(cost / (c.cpc * (0.85 + rand() * 0.3))));
        const impressions = Math.round(clicks / (c.ctr * (0.85 + rand() * 0.3)));
        const noConv = demo.noConvLastDays && date > addDays(to, -demo.noConvLastDays);
        let conversions = 0;
        if (!noConv) for (let i = 0; i < clicks; i++) if (rand() < c.convRate) conversions++;
        rows.push({ date, campaignId: c.id, campaignName: c.name, impressions, clicks, cost: Math.round(cost * 100) / 100, conversions });
      }
    }
    const sentAt = new Date(now.getTime() - (demo.stoppedDaysAgo ?? 0) * 86_400_000 - 5 * 3_600_000);
    await ingestForClient(
      db,
      client,
      ingestPayloadSchema.parse({
        customerId: `${100 + index}-555-0${100 + index}`,
        from,
        to,
        rows,
        campaigns: demo.campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status ?? "ENABLED" })),
      }),
      "script",
      sentAt,
    );
  }
  await syncAlerts(db, ws.id, { now });
  console.log(`${DEMOS.length} clientes de exemplo criados. Para apagar: npm run demo -- limpar`);
  await closeDb();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
