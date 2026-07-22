-- AlterTable
ALTER TABLE "items" ADD COLUMN     "countCycleMonths" INTEGER,
ADD COLUMN     "lastCountDate" TIMESTAMP(3),
ADD COLUMN     "nextCountDate" TIMESTAMP(3);
