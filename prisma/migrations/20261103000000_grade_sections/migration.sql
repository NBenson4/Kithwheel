-- Grade sections replace the class library and co-op-wide schedules.
-- Each co-op gets nine default sections; existing classes and children are filed into
-- sections from the current schedule's age groups, then the old schedule tables go away.

-- CreateEnum
CREATE TYPE "CoopSectionStatus" AS ENUM ('DRAFT', 'APPROVED');
CREATE TYPE "CoopClassExceptionKind" AS ENUM ('ADD', 'SKIP');

-- CreateTable
CREATE TABLE "CoopSection" (
    "id" TEXT NOT NULL,
    "coopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "CoopSectionStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoopSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoopClassException" (
    "id" TEXT NOT NULL,
    "coopId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "kind" "CoopClassExceptionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoopClassException_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CoopAnnouncement" ADD COLUMN "sectionId" TEXT;
ALTER TABLE "CoopChild" ADD COLUMN "requestedSection" TEXT, ADD COLUMN "sectionId" TEXT;
ALTER TABLE "CoopClass" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "sectionId" TEXT;

-- ── Data ────────────────────────────────────────────────────────────────────

-- Nine default sections for every co-op.
INSERT INTO "CoopSection" ("id", "coopId", "name", "position", "updatedAt")
SELECT gen_random_uuid()::text, c."id", d.name, d.pos, now()
FROM "Coop" c
CROSS JOIN (VALUES
  ('Pre-K', 0), ('Kindergarten', 1), ('1st grade', 2), ('2nd grade', 3), ('3rd grade', 4),
  ('4th grade', 5), ('5th grade', 6), ('6th–7th grade', 7), ('8th–12th grade', 8)
) AS d(name, pos);

-- Keep any age group from the current schedule that isn't one of the defaults.
INSERT INTO "CoopSection" ("id", "coopId", "name", "position", "updatedAt")
SELECT DISTINCT ON (c."id", lower(trim(r."ageGroup")))
  gen_random_uuid()::text, c."id", trim(r."ageGroup"), 9 + r."position", now()
FROM "Coop" c
JOIN "CoopScheduleRotation" r ON r."scheduleId" = c."currentScheduleId"
WHERE NOT EXISTS (
  SELECT 1 FROM "CoopSection" s
  WHERE s."coopId" = c."id" AND lower(s."name") = lower(trim(r."ageGroup"))
)
ORDER BY c."id", lower(trim(r."ageGroup")), r."position";

-- File each class under the first age group it appeared in.
UPDATE "CoopClass" k
SET "sectionId" = sub.section_id, "position" = sub.pos
FROM (
  SELECT DISTINCT ON (e."classId") e."classId" AS class_id, s."id" AS section_id, e."position" AS pos
  FROM "Coop" c
  JOIN "CoopScheduleRotation" r ON r."scheduleId" = c."currentScheduleId"
  JOIN "CoopScheduleEntry" e ON e."rotationId" = r."id"
  JOIN "CoopSection" s ON s."coopId" = c."id" AND lower(s."name") = lower(trim(r."ageGroup"))
  ORDER BY e."classId", r."position"
) sub
WHERE k."id" = sub.class_id;

-- Sections whose classes were in a published schedule start out approved.
UPDATE "CoopSection" s
SET "status" = 'APPROVED', "approvedAt" = now()
WHERE EXISTS (
  SELECT 1 FROM "CoopClass" k
  JOIN "Coop" c ON c."id" = k."coopId"
  JOIN "CoopSchedule" sc ON sc."id" = c."currentScheduleId" AND sc."status" = 'PUBLISHED'
  WHERE k."sectionId" = s."id"
);

-- Children whose age group matches a section join it; others keep it as their requested grade.
UPDATE "CoopChild" ch
SET "sectionId" = s."id"
FROM "CoopSection" s
WHERE s."coopId" = ch."coopId" AND lower(s."name") = lower(trim(ch."ageGroup"));

UPDATE "CoopChild"
SET "requestedSection" = trim("ageGroup")
WHERE "sectionId" IS NULL AND "ageGroup" IS NOT NULL AND trim("ageGroup") <> '';

-- Keep earlier placements as exceptions: classes taken from another section...
INSERT INTO "CoopClassException" ("id", "coopId", "childId", "classId", "kind")
SELECT gen_random_uuid()::text, en."coopId", en."childId", en."classId", 'ADD'
FROM "CoopEnrollment" en
JOIN "CoopChild" ch ON ch."id" = en."childId"
JOIN "CoopClass" k ON k."id" = en."classId"
WHERE en."status" = 'ENROLLED' AND ch."sectionId" IS NOT NULL
  AND k."sectionId" IS DISTINCT FROM ch."sectionId";

-- ...and their own section's classes they weren't in.
INSERT INTO "CoopClassException" ("id", "coopId", "childId", "classId", "kind")
SELECT gen_random_uuid()::text, ch."coopId", ch."id", k."id", 'SKIP'
FROM "CoopChild" ch
JOIN "CoopClass" k ON k."sectionId" = ch."sectionId"
WHERE EXISTS (SELECT 1 FROM "CoopEnrollment" en WHERE en."childId" = ch."id")
  AND NOT EXISTS (
    SELECT 1 FROM "CoopEnrollment" en
    WHERE en."childId" = ch."id" AND en."classId" = k."id" AND en."status" = 'ENROLLED'
  );

-- ── Old structure ───────────────────────────────────────────────────────────

ALTER TABLE "CoopEnrollment" DROP CONSTRAINT "CoopEnrollment_childId_fkey";
ALTER TABLE "CoopEnrollment" DROP CONSTRAINT "CoopEnrollment_classId_fkey";
ALTER TABLE "CoopSchedule" DROP CONSTRAINT "CoopSchedule_coopId_fkey";
ALTER TABLE "CoopScheduleEntry" DROP CONSTRAINT "CoopScheduleEntry_classId_fkey";
ALTER TABLE "CoopScheduleEntry" DROP CONSTRAINT "CoopScheduleEntry_rotationId_fkey";
ALTER TABLE "CoopScheduleRotation" DROP CONSTRAINT "CoopScheduleRotation_scheduleId_fkey";

ALTER TABLE "Coop" DROP COLUMN "currentScheduleId";
ALTER TABLE "CoopChild" DROP COLUMN "ageGroup";

DROP TABLE "CoopEnrollment";
DROP TABLE "CoopSchedule";
DROP TABLE "CoopScheduleEntry";
DROP TABLE "CoopScheduleRotation";
DROP TYPE "CoopEnrollmentStatus";
DROP TYPE "CoopScheduleStatus";

-- CreateIndex
CREATE INDEX "CoopSection_coopId_position_idx" ON "CoopSection"("coopId", "position");
CREATE INDEX "CoopClassException_classId_idx" ON "CoopClassException"("classId");
CREATE INDEX "CoopClassException_coopId_idx" ON "CoopClassException"("coopId");
CREATE UNIQUE INDEX "CoopClassException_childId_classId_key" ON "CoopClassException"("childId", "classId");
CREATE INDEX "CoopChild_sectionId_idx" ON "CoopChild"("sectionId");
CREATE INDEX "CoopClass_sectionId_position_idx" ON "CoopClass"("sectionId", "position");

-- AddForeignKey
ALTER TABLE "CoopChild" ADD CONSTRAINT "CoopChild_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CoopSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoopAnnouncement" ADD CONSTRAINT "CoopAnnouncement_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CoopSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoopClass" ADD CONSTRAINT "CoopClass_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CoopSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoopSection" ADD CONSTRAINT "CoopSection_coopId_fkey" FOREIGN KEY ("coopId") REFERENCES "Coop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoopClassException" ADD CONSTRAINT "CoopClassException_childId_fkey" FOREIGN KEY ("childId") REFERENCES "CoopChild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoopClassException" ADD CONSTRAINT "CoopClassException_classId_fkey" FOREIGN KEY ("classId") REFERENCES "CoopClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
