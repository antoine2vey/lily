-- One row per unit "subscription_usage" counts for a chat, scan or identify
-- still running. The api moves the row out of 'reserved' when the work ends,
-- and a sweep refunds a row left 'reserved' by a process that died. Only a
-- new table: the release already running never reads or writes it. The
-- foreign key takes SHARE ROW EXCLUSIVE on "subscription_usage" for an
-- instant, which the timeout bounds.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "usage_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "usage_id" uuid NOT NULL,
  "field" text NOT NULL,
  "state" text DEFAULT 'reserved' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "settled_at" timestamp with time zone,
  CONSTRAINT "usage_reservations_usage_id_subscription_usage_id_fk"
    FOREIGN KEY ("usage_id") REFERENCES "subscription_usage"("id") ON DELETE cascade,
  CONSTRAINT "usage_reservations_field_known"
    CHECK ("field" IN ('aiChats', 'cardScans', 'plantIdentifies')),
  CONSTRAINT "usage_reservations_state_known"
    CHECK ("state" IN ('reserved', 'charged', 'refunded'))
);
--> statement-breakpoint
CREATE INDEX "usage_reservations_usage_id_idx" ON "usage_reservations" ("usage_id");
--> statement-breakpoint
CREATE INDEX "usage_reservations_reserved_idx" ON "usage_reservations" ("created_at") WHERE "state" = 'reserved';
