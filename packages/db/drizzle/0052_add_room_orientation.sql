-- Add window orientation (8-point compass: N/NE/E/SE/S/SW/W/NW) to rooms.
-- Consumed by the indoor weather-care model to refine seasonal light estimates.
-- Nullable: unset rooms are treated as neutral by the algorithm.
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "orientation" text;
