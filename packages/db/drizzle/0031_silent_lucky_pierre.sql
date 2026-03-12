ALTER TABLE "oauth_access_tokens" ADD COLUMN "api_jwt" text;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD COLUMN "api_refresh_token" text;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD COLUMN "api_jwt" text;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD COLUMN "api_refresh_token" text;