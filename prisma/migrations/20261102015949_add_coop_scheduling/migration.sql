-- CreateEnum
CREATE TYPE "CoopScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'WITHDRAWN', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Coop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "currentScheduleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoopMembership" (
    "id" TEXT NOT NULL,
    "coopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'coordinator',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoopMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoopClass" (
    "id" TEXT NOT NULL,
    "coopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "teacher" TEXT,
    "room" TEXT,
    "time" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoopClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoopSchedule" (
    "id" TEXT NOT NULL,
    "coopId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "CoopScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoopSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoopScheduleRotation" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "ageGroup" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CoopScheduleRotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoopScheduleEntry" (
    "id" TEXT NOT NULL,
    "rotationId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CoopScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoopMembership_userId_role_idx" ON "CoopMembership"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "CoopMembership_coopId_userId_key" ON "CoopMembership"("coopId", "userId");

-- CreateIndex
CREATE INDEX "CoopClass_coopId_name_idx" ON "CoopClass"("coopId", "name");

-- CreateIndex
CREATE INDEX "CoopSchedule_coopId_status_updatedAt_idx" ON "CoopSchedule"("coopId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoopScheduleRotation_scheduleId_position_key" ON "CoopScheduleRotation"("scheduleId", "position");

-- CreateIndex
CREATE INDEX "CoopScheduleEntry_classId_idx" ON "CoopScheduleEntry"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "CoopScheduleEntry_rotationId_position_key" ON "CoopScheduleEntry"("rotationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CoopScheduleEntry_rotationId_classId_key" ON "CoopScheduleEntry"("rotationId", "classId");

-- AddForeignKey
ALTER TABLE "CoopMembership" ADD CONSTRAINT "CoopMembership_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopClass" ADD CONSTRAINT "CoopClass_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopSchedule" ADD CONSTRAINT "CoopSchedule_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopScheduleRotation" ADD CONSTRAINT "CoopScheduleRotation_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "CoopSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopScheduleEntry" ADD CONSTRAINT "CoopScheduleEntry_rotationId_fkey" FOREIGN KEY ("rotationId") REFERENCES "CoopScheduleRotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopScheduleEntry" ADD CONSTRAINT "CoopScheduleEntry_classId_fkey" FOREIGN KEY ("classId") REFERENCES "CoopClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
