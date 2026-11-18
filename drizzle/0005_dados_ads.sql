CREATE TABLE "conversion_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"action_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"primary" boolean DEFAULT false NOT NULL,
	"conversions_30d" numeric(14, 2) DEFAULT 0 NOT NULL,
	"last_conversion_date" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"keyword_id" text NOT NULL,
	"campaign_name" text NOT NULL,
	"text" text NOT NULL,
	"match_type" text NOT NULL,
	"quality_score" integer,
	"ad_relevance" text,
	"landing_page" text,
	"expected_ctr" text,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"conversions" numeric(14, 2) DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"date" date NOT NULL,
	"campaign_id" text NOT NULL,
	"term" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"conversions" numeric(14, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD COLUMN "impression_share" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD COLUMN "lost_budget_share" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD COLUMN "lost_rank_share" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "conversion_actions" ADD CONSTRAINT "conversion_actions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_actions" ADD CONSTRAINT "conversion_actions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_terms" ADD CONSTRAINT "search_terms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_terms" ADD CONSTRAINT "search_terms_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversion_actions_client_action_idx" ON "conversion_actions" USING btree ("client_id","action_id");--> statement-breakpoint
CREATE UNIQUE INDEX "keywords_client_keyword_idx" ON "keywords" USING btree ("client_id","keyword_id");--> statement-breakpoint
CREATE UNIQUE INDEX "search_terms_unique_idx" ON "search_terms" USING btree ("client_id","date","campaign_id","term");--> statement-breakpoint
ALTER TABLE "search_terms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "keywords" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversion_actions" ENABLE ROW LEVEL SECURITY;
