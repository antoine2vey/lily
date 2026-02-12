CREATE TYPE "public"."diagnosis_severity" AS ENUM('LOW', 'MODERATE', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."diagnosis_status" AS ENUM('ACTIVE', 'RESOLVED');--> statement-breakpoint
CREATE TABLE "diagnoses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"chat_message_id" text,
	"disease_name" text NOT NULL,
	"severity" "diagnosis_severity" NOT NULL,
	"confidence" integer NOT NULL,
	"symptoms" jsonb NOT NULL,
	"treatment_steps" jsonb NOT NULL,
	"prevention_tips" jsonb,
	"image_url" text,
	"status" "diagnosis_status" DEFAULT 'ACTIVE' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;