-- CreateEnum
CREATE TYPE "CoopEnrollmentStatus" AS ENUM ('ENROLLED', 'WAITLISTED');

-- CreateEnum
CREATE TYPE "CoopVolunteerStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterTable
ALTER TABLE "Coop" ADD COLUMN     "childFeeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "familyFeeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "meetingDay" INTEGER,
ADD COLUMN     "paymentInstructions" TEXT,
ADD COLUMN     "registrationNote" TEXT,
ADD COLUMN     "registrationOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shareToken" TEXT,
ADD COLUMN     "termEnd" DATE,
ADD COLUMN     "termStart" DATE,
ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
ADD COLUMN     "volunteerMinutesRequired" INTEGER;

-- AlterTable
ALTER TABLE "CoopClass" ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "feeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "materials" TEXT;

-- CreateTable
CREATE TABLE "CoopInvite" (
    "id" TEXT NOT NULL,
    "coopId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,

    CONSTRAINT "CoopInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoopFamily" (
    "id" TEXT NOT NULL,
    "coopId" TEXT NOT NULL,
    "parentName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "accessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoopFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoopChild" (
    "id" TEXT NOT NULL,
    "coopId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ageGroup" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoopChild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoopEnrollment" (
    "id" TEXT NOT NULL,
    "coopId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "status" "CoopEnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMP(3),

    CONSTRAINT "CoopEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoopAnnouncement" (
    "id" TEXT NOT NULL,
    "coopId" TEXT NOT NULL,
    "classId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoopAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoopVolunteerLog" (
    "id" TEXT NOT NULL,
    "coopId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "status" "CoopVolunteerStatus" NOT NULL DEFAULT 'PENDING',
    "addedByCoordinator" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoopVolunteerLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoopFamilyCharge" (
    "id" TEXT NOT NULL,
    "coopId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoopFamilyCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoopFamilyPayment" (
    "id" TEXT NOT NULL,
    "coopId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "note" TEXT,
    "paidOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoopFamilyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoopInvite_tokenHash_key" ON "CoopInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "CoopInvite_coopId_acceptedAt_idx" ON "CoopInvite"("coopId", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoopFamily_accessToken_key" ON "CoopFamily"("accessToken");

-- CreateIndex
CREATE INDEX "CoopFamily_coopId_parentName_idx" ON "CoopFamily"("coopId", "parentName");

-- CreateIndex
CREATE UNIQUE INDEX "CoopFamily_coopId_email_key" ON "CoopFamily"("coopId", "email");

-- CreateIndex
CREATE INDEX "CoopChild_familyId_idx" ON "CoopChild"("familyId");

-- CreateIndex
CREATE INDEX "CoopEnrollment_classId_status_createdAt_idx" ON "CoopEnrollment"("classId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CoopEnrollment_coopId_idx" ON "CoopEnrollment"("coopId");

-- CreateIndex
CREATE UNIQUE INDEX "CoopEnrollment_childId_classId_key" ON "CoopEnrollment"("childId", "classId");

-- CreateIndex
CREATE INDEX "CoopAnnouncement_coopId_createdAt_idx" ON "CoopAnnouncement"("coopId", "createdAt");

-- CreateIndex
CREATE INDEX "CoopVolunteerLog_coopId_status_idx" ON "CoopVolunteerLog"("coopId", "status");

-- CreateIndex
CREATE INDEX "CoopVolunteerLog_familyId_idx" ON "CoopVolunteerLog"("familyId");

-- CreateIndex
CREATE INDEX "CoopFamilyCharge_familyId_idx" ON "CoopFamilyCharge"("familyId");

-- CreateIndex
CREATE INDEX "CoopFamilyPayment_familyId_idx" ON "CoopFamilyPayment"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Coop_shareToken_key" ON "Coop"("shareToken");

-- AddForeignKey
ALTER TABLE "CoopInvite" ADD CONSTRAINT "CoopInvite_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopFamily" ADD CONSTRAINT "CoopFamily_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopChild" ADD CONSTRAINT "CoopChild_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "CoopFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopEnrollment" ADD CONSTRAINT "CoopEnrollment_childId_fkey" FOREIGN KEY ("childId") REFERENCES "CoopChild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopEnrollment" ADD CONSTRAINT "CoopEnrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "CoopClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopAnnouncement" ADD CONSTRAINT "CoopAnnouncement_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopAnnouncement" ADD CONSTRAINT "CoopAnnouncement_classId_fkey" FOREIGN KEY ("classId") REFERENCES "CoopClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopVolunteerLog" ADD CONSTRAINT "CoopVolunteerLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "CoopFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopFamilyCharge" ADD CONSTRAINT "CoopFamilyCharge_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "CoopFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoopFamilyPayment" ADD CONSTRAINT "CoopFamilyPayment_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "CoopFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

