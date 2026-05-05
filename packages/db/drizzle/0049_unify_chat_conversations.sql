CREATE TABLE IF NOT EXISTS "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"kind" text NOT NULL,
	"plant_id" uuid REFERENCES "plants"("id") ON DELETE CASCADE,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_conversations_kind_plant_consistency" CHECK (
		(kind = 'plant' AND plant_id IS NOT NULL)
		OR (kind = 'general' AND plant_id IS NULL)
	)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_conversations_user_recent_idx" ON "chat_conversations" USING btree ("user_id","last_message_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_conversations_user_plant_unique" ON "chat_conversations" USING btree ("user_id","plant_id") WHERE "kind" = 'plant';
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "conversation_id" uuid REFERENCES "chat_conversations"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- Backfill: one conversation per existing (user_id, plant_id) thread
INSERT INTO "chat_conversations" ("id", "user_id", "kind", "plant_id", "created_at", "last_message_at")
SELECT gen_random_uuid(), "user_id", 'plant', "plant_id", MIN("created_at"), MAX("created_at")
FROM "chat_messages"
WHERE "plant_id" IS NOT NULL
GROUP BY "user_id", "plant_id";
--> statement-breakpoint
-- Link existing messages to their newly-created conversation
UPDATE "chat_messages" m
SET "conversation_id" = c."id"
FROM "chat_conversations" c
WHERE c."kind" = 'plant'
  AND c."user_id" = m."user_id"
  AND c."plant_id" = m."plant_id";
--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "conversation_id" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_messages_conversation_idx" ON "chat_messages" USING btree ("conversation_id","created_at");
--> statement-breakpoint
DROP INDEX IF EXISTS "chat_messages_user_plant_idx";
--> statement-breakpoint
ALTER TABLE "chat_messages" DROP COLUMN IF EXISTS "plant_id";
