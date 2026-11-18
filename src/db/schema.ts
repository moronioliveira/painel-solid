import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Dono dos dados. Hoje só existe um; cada conta vendida no futuro vira um workspace. */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** ID da conta no Google Ads (123-456-7890), preenchido pelo script. */
    adsCustomerId: text("ads_customer_id"),
    monthlyBudget: numeric("monthly_budget", { precision: 14, scale: 2, mode: "number" }),
    targetCpl: numeric("target_cpl", { precision: 14, scale: 2, mode: "number" }),
    /** sha256 da chave de envio. A chave em si só é mostrada uma vez. */
    ingestKeyHash: text("ingest_key_hash").notNull(),
    ingestKeyHint: text("ingest_key_hint").notNull(),
    /** Token do link público de relatório. */
    reportToken: text("report_token").notNull(),
    active: boolean("active").notNull().default(true),
    /** Acesso do cliente ao link do relatório. Suspenso bloqueia na hora. */
    accessSuspended: boolean("access_suspended").notNull().default(false),
    /** Último dia pago. Vazio = sem controle de vencimento. */
    paidUntil: date("paid_until", { mode: "string" }),
    /** Dias de tolerância depois do vencimento antes de bloquear o link. */
    graceDays: integer("grace_days").notNull().default(5),
    lastIngestAt: timestamp("last_ingest_at", { withTimezone: true }),
    /** script | csv — de onde veio o último envio. O alerta de "script parou" só vale para script. */
    lastIngestSource: text("last_ingest_source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("clients_workspace_idx").on(t.workspaceId),
    uniqueIndex("clients_ingest_key_idx").on(t.ingestKeyHash),
    uniqueIndex("clients_report_token_idx").on(t.reportToken),
  ],
);

/** Lista de campanhas da conta (inclui as que não tiveram impressão). */
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").notNull(),
    name: text("name").notNull(),
    /** ENABLED | PAUSED | REMOVED | UNKNOWN */
    status: text("status").notNull().default("UNKNOWN"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("campaigns_client_campaign_idx").on(t.clientId, t.campaignId)],
);

/** Uma linha por cliente, dia e campanha. */
export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    campaignId: text("campaign_id").notNull(),
    campaignName: text("campaign_name").notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    cost: numeric("cost", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    conversions: numeric("conversions", { precision: 14, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    conversionsValue: numeric("conversions_value", { precision: 14, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    /** Parcela de impressões na Pesquisa (0 a 1). Vazio quando o Google não informa (CSV, script antigo, outra rede). */
    impressionShare: numeric("impression_share", { precision: 6, scale: 4, mode: "number" }),
    /** Parcela perdida por verba (0 a 1). */
    lostBudgetShare: numeric("lost_budget_share", { precision: 6, scale: 4, mode: "number" }),
    /** Parcela perdida por classificação: lance ou qualidade (0 a 1). */
    lostRankShare: numeric("lost_rank_share", { precision: 6, scale: 4, mode: "number" }),
  },
  (t) => [
    uniqueIndex("daily_metrics_unique_idx").on(t.clientId, t.date, t.campaignId),
    index("daily_metrics_workspace_date_idx").on(t.workspaceId, t.date),
  ],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Tipo do alerta, ver src/lib/alerts/types.ts */
    type: text("type").notNull(),
    /** Diferencia alertas do mesmo tipo (ex.: id da campanha). Vazio quando não se aplica. */
    key: text("key").notNull().default(""),
    /** warning | critical */
    severity: text("severity").notNull(),
    message: text("message").notNull(),
    /** open | resolved */
    status: text("status").notNull().default("open"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("alerts_workspace_status_idx").on(t.workspaceId, t.status),
    index("alerts_client_idx").on(t.clientId),
  ],
);

export type Workspace = typeof workspaces.$inferSelect;
export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type DailyMetric = typeof dailyMetrics.$inferSelect;
export type AlertRow = typeof alerts.$inferSelect;

/** Tentativas de login que falharam, para travar força bruta. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_email_idx").on(t.email, t.createdAt)],
);

/** Resultado real informado pelo gestor, um registro por cliente e mês. */
export const monthlyResults = pgTable(
  "monthly_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** "AAAA-MM" */
    month: text("month").notNull(),
    /** Contatos que chegaram ao cliente (ex.: mensagens no WhatsApp com "(ref. C1)"). */
    leads: integer("leads"),
    /** Vendas, contratos ou clientes novos fechados a partir desses contatos. */
    deals: integer("deals"),
    /** Receita desses fechamentos, em R$. */
    revenue: numeric("revenue", { precision: 14, scale: 2, mode: "number" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("monthly_results_client_month_idx").on(t.clientId, t.month)],
);

/** Termos que as pessoas pesquisaram e que acionaram anúncios (só os que tiveram clique). */
export const searchTerms = pgTable(
  "search_terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    campaignId: text("campaign_id").notNull(),
    term: text("term").notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    cost: numeric("cost", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    conversions: numeric("conversions", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  },
  (t) => [uniqueIndex("search_terms_unique_idx").on(t.clientId, t.date, t.campaignId, t.term)],
);

/** Retrato atual das palavras-chave (substituído a cada envio), com números dos últimos 30 dias. */
export const keywords = pgTable(
  "keywords",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    keywordId: text("keyword_id").notNull(),
    campaignName: text("campaign_name").notNull(),
    text: text("text").notNull(),
    /** EXACT | PHRASE | BROAD */
    matchType: text("match_type").notNull(),
    /** Índice de qualidade de 1 a 10. Vazio quando o Google ainda não calculou. */
    qualityScore: integer("quality_score"),
    /** BELOW_AVERAGE | AVERAGE | ABOVE_AVERAGE | UNKNOWN */
    adRelevance: text("ad_relevance"),
    landingPage: text("landing_page"),
    expectedCtr: text("expected_ctr"),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    cost: numeric("cost", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    conversions: numeric("conversions", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("keywords_client_keyword_idx").on(t.clientId, t.keywordId)],
);

/** Ações de conversão da conta (substituído a cada envio). */
export const conversionActions = pgTable(
  "conversion_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    actionId: text("action_id").notNull(),
    name: text("name").notNull(),
    /** ENABLED | HIDDEN | ... */
    status: text("status").notNull(),
    category: text("category").notNull().default(""),
    /** Conta como conversão principal (entra na coluna Conversões e nos lances). */
    primary: boolean("primary").notNull().default(false),
    conversions30d: numeric("conversions_30d", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    lastConversionDate: date("last_conversion_date", { mode: "string" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("conversion_actions_client_action_idx").on(t.clientId, t.actionId)],
);

export type MonthlyResult = typeof monthlyResults.$inferSelect;
