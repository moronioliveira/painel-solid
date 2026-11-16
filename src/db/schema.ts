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
