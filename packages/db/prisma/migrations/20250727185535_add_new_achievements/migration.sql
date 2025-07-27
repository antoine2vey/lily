-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AchievementKey" ADD VALUE 'SCAN_CHAMP';
ALTER TYPE "AchievementKey" ADD VALUE 'FERTILIZER_GURU';
ALTER TYPE "AchievementKey" ADD VALUE 'HISTORY_HERO';
ALTER TYPE "AchievementKey" ADD VALUE 'AI_CONVERSATIONALIST';
ALTER TYPE "AchievementKey" ADD VALUE 'DISEASE_DETECTIVE';
ALTER TYPE "AchievementKey" ADD VALUE 'GROWTH_TRACKER';
ALTER TYPE "AchievementKey" ADD VALUE 'REMINDER_RESCUER';
ALTER TYPE "AchievementKey" ADD VALUE 'SHARE_SPROUT';
