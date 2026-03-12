CREATE TYPE "public"."blog_post_status" AS ENUM('pending', 'researching', 'generating', 'reviewing', 'published', 'rejected');--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" jsonb NOT NULL,
	"category" text NOT NULL,
	"tags" text[] NOT NULL,
	"status" "blog_post_status" DEFAULT 'pending' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content" jsonb,
	"review_score" integer,
	"review_feedback" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"commit_shas" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "daily_tips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" jsonb NOT NULL,
	"body" jsonb NOT NULL,
	"category" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"publish_date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_tips_publish_date_unique" UNIQUE("publish_date")
);
--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD COLUMN "api_jwt" text;--> statement-breakpoint
ALTER TABLE "oauth_access_tokens" ADD COLUMN "api_refresh_token" text;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD COLUMN "api_jwt" text;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD COLUMN "api_refresh_token" text;