/*
  Warnings:

  - You are about to drop the column `appleId` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "users_appleId_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "appleId";
