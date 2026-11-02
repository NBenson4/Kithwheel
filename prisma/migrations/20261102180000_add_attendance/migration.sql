-- CreateEnum
CREATE TYPE "CoopAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');

-- AlterTable
ALTER TABLE "Coop" ADD COLUMN     "kioskToken" TEXT;

-- CreateTable
CREATE TABLE "CoopAttendance" (
    "id" TEXT NOT NULL,
    "coopId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "CoopAttendanceStatus" NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'coordinator',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoopAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoopAttendance_coopId_date_idx" ON "CoopAttendance"("coopId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CoopAttendance_childId_date_key" ON "CoopAttendance"("childId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Coop_kioskToken_key" ON "Coop"("kioskToken");

-- AddForeignKey
ALTER TABLE "CoopAttendance" ADD CONSTRAINT "CoopAttendance_childId_fkey" FOREIGN KEY ("childId") REFERENCES "CoopChild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

