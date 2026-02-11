CREATE TABLE "weather_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"date" text NOT NULL,
	"temperature_min" double precision,
	"temperature_max" double precision,
	"temperature_mean" double precision,
	"humidity" double precision,
	"wind_speed" double precision,
	"precipitation" double precision,
	"solar_radiation" double precision,
	"et0" double precision,
	"cloud_cover" double precision,
	"soil_temperature" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weather_snapshots_location_date_idx" UNIQUE("latitude","longitude","date")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "weather_enabled" boolean DEFAULT false NOT NULL;