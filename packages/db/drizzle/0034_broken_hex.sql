CREATE TABLE "oauth_user_api_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"api_jwt" text NOT NULL,
	"api_refresh_token" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_user_api_credentials" ADD CONSTRAINT "oauth_user_api_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" DROP COLUMN "api_jwt";--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" DROP COLUMN "api_refresh_token";--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" DROP COLUMN "api_jwt";--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" DROP COLUMN "api_refresh_token";--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" DROP COLUMN "api_jwt";--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" DROP COLUMN "api_refresh_token";