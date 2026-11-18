ALTER TABLE "clients" ADD COLUMN "access_suspended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "paid_until" date;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "grace_days" integer DEFAULT 5 NOT NULL;