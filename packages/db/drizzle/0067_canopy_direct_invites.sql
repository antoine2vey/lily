DO $$
BEGIN
  CREATE TYPE "canopy_direct_invite_status" AS ENUM ('pending', 'accepted', 'declined', 'withdrawn');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canopy_direct_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canopy_id" uuid NOT NULL CONSTRAINT "canopy_direct_invites_canopy_id_canopies_id_fk" REFERENCES "canopies"("id") ON DELETE CASCADE,
	"invitee_user_id" uuid NOT NULL CONSTRAINT "canopy_direct_invites_invitee_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE CASCADE,
	"invited_by_user_id" uuid NOT NULL CONSTRAINT "canopy_direct_invites_invited_by_user_id_users_id_fk" REFERENCES "users"("id") ON DELETE CASCADE,
	"status" "canopy_direct_invite_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canopy_direct_invites_pair_unique" ON "canopy_direct_invites" USING btree ("canopy_id", "invitee_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canopy_direct_invites_invitee_idx" ON "canopy_direct_invites" USING btree ("invitee_user_id");
