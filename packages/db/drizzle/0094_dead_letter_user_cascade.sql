-- A purge now deletes the user's dead letters. The payload of a dead letter
-- carries the user's id, which ON DELETE SET NULL left behind. This file
-- changes the rule only and deletes no row. NOT VALID swaps the foreign key
-- without scanning the table, so the lock on "users" lasts milliseconds.
-- 0095 checks the existing rows under a lock that lets reads and writes run.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "dead_letter_messages"
  DROP CONSTRAINT "dead_letter_messages_user_id_users_id_fk",
  ADD CONSTRAINT "dead_letter_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE NOT VALID;
