-- RevenueCat delivers webhook events at least once and in no guaranteed
-- order. Each applied event is recorded by RevenueCat's event id so a
-- redelivery is acknowledged without being applied twice. Rows are kept
-- for audit.
CREATE TABLE IF NOT EXISTS "revenuecat_webhook_events" (
  "id" text PRIMARY KEY,
  "event_type" text NOT NULL,
  "app_user_id" text NOT NULL,
  "environment" text NOT NULL,
  "received_at" timestamp with time zone NOT NULL DEFAULT now()
);
