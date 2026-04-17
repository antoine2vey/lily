CREATE TABLE IF NOT EXISTS "analytics_daily_snapshots" (
	"date" date NOT NULL,
	"metric_key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_daily_snapshots_pkey" PRIMARY KEY ("date", "metric_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_daily_snapshots_metric_key_idx" ON "analytics_daily_snapshots" USING btree ("metric_key");
