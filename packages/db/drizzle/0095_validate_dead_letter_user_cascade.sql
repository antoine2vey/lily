-- Checks the rows that predate 0094. VALIDATE takes SHARE UPDATE EXCLUSIVE on
-- "dead_letter_messages" and ROW SHARE on "users", so reads and writes of
-- both keep running while it scans.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "dead_letter_messages" VALIDATE CONSTRAINT "dead_letter_messages_user_id_users_id_fk";
