CREATE TABLE "checklist_done" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"done_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"month" text NOT NULL,
	"leads" integer,
	"deals" integer,
	"revenue" numeric(14, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_done" ADD CONSTRAINT "checklist_done_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_done" ADD CONSTRAINT "checklist_done_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_results" ADD CONSTRAINT "monthly_results_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_results" ADD CONSTRAINT "monthly_results_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_done_client_item_idx" ON "checklist_done" USING btree ("client_id","item_key");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_results_client_month_idx" ON "monthly_results" USING btree ("client_id","month");--> statement-breakpoint
ALTER TABLE "monthly_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checklist_done" ENABLE ROW LEVEL SECURITY;
