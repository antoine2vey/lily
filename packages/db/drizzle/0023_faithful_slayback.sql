-- Clear existing non-UUID values before type change
UPDATE "diagnoses" SET "chat_message_id" = NULL WHERE "chat_message_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "diagnoses" ALTER COLUMN "chat_message_id" SET DATA TYPE uuid USING "chat_message_id"::uuid;--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_chat_message_id_chat_messages_id_fk" FOREIGN KEY ("chat_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;
