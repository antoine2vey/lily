-- CreateEnum
CREATE TYPE "AchievementKey" AS ENUM ('FIRST_PLANT_ADDED', 'WATERING_NOVICE', 'PLANT_COLLECTOR', 'DEDICATED_CARETAKER', 'ATTENTION_ALERT', 'PHOTO_PRO', 'RARE_COLLECTOR');

-- AlterTable
ALTER TABLE "plants" ADD COLUMN     "fertilizationFrequencyDays" INTEGER,
ADD COLUMN     "lastFertilizedAt" TIMESTAMP(3),
ADD COLUMN     "nextFertilizationAt" TIMESTAMP(3),
ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "fertilization_history" (
    "id" TEXT NOT NULL,
    "fertilizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plantId" TEXT NOT NULL,

    CONSTRAINT "fertilization_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plant_photos" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plantId" TEXT NOT NULL,

    CONSTRAINT "plant_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievement" "AchievementKey" NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_achievements_userId_achievement_key" ON "user_achievements"("userId", "achievement");

-- AddForeignKey
ALTER TABLE "fertilization_history" ADD CONSTRAINT "fertilization_history_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plant_photos" ADD CONSTRAINT "plant_photos_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
