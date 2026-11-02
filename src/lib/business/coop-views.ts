// Response shaping for the coordinator's family, settings and team views, and for the
// family-facing pages.
import 'server-only';
import {
  coopCalendarUrl,
  type FamilyWithDetails,
  familyBalance,
  familyCalendarUrl,
  familyInclude,
  familyUrl,
  isoDay,
  kioskUrl,
  readPublicSchedule,
  seatCounts,
  shareUrl,
  toPublicClass,
  volunteerSummary,
} from '@/lib/business/families';
import {
  type ClassRoster,
  CoopSettings,
  FamilyHome,
  FamilyOverview,
  type FamilyRecord,
} from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

export function calendarReady(coop: {
  meetingDay: number | null;
  termStart: Date | null;
  termEnd: Date | null;
}) {
  return coop.meetingDay !== null && coop.termStart !== null && coop.termEnd !== null;
}

export async function readSettings(coopId: string) {
  const coop = await prisma.coop.findUniqueOrThrow({ where: { id: coopId } });
  const [classes, classFees, families, coordinators, pendingInvites] = await Promise.all([
    prisma.coopClass.count({ where: { coopId } }),
    prisma.coopClass.count({ where: { coopId, feeCents: { gt: 0 } } }),
    prisma.coopFamily.count({ where: { coopId } }),
    prisma.coopMembership.count({ where: { coopId, role: 'coordinator' } }),
    prisma.coopInvite.count({
      where: { coopId, acceptedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);
  return CoopSettings.parse({
    shareUrl: coop.shareToken ? shareUrl(coop.shareToken) : null,
    kioskUrl: coop.kioskToken ? kioskUrl(coop.kioskToken) : null,
    registrationOpen: coop.registrationOpen,
    autoPlace: coop.autoPlace,
    registrationNote: coop.registrationNote,
    timeZone: coop.timeZone,
    meetingDay: coop.meetingDay,
    termStart: coop.termStart ? isoDay(coop.termStart) : null,
    termEnd: coop.termEnd ? isoDay(coop.termEnd) : null,
    familyFeeCents: coop.familyFeeCents,
    childFeeCents: coop.childFeeCents,
    paymentInstructions: coop.paymentInstructions,
    volunteerMinutesRequired: coop.volunteerMinutesRequired,
    hasCurrentSchedule: coop.currentScheduleId !== null,
    counts: { classes, classFees, families, coordinators, pendingInvites },
  });
}

function toFamilyRecord(
  family: FamilyWithDetails,
  coop: { familyFeeCents: number; childFeeCents: number },
): FamilyRecord {
  return {
    id: family.id,
    parentName: family.parentName,
    email: family.email,
    phone: family.phone,
    notes: family.notes,
    familyUrl: familyUrl(family.accessToken),
    createdAt: family.createdAt.toISOString(),
    children: family.children.map((child) => ({
      id: child.id,
      name: child.name,
      ageGroup: child.ageGroup,
      enrollments: child.enrollments.map((entry) => ({
        id: entry.id,
        classId: entry.classId,
        className: entry.class.name,
        status: entry.status === 'ENROLLED' ? 'enrolled' : 'waitlisted',
      })),
    })),
    balance: familyBalance(family, coop),
    charges: family.charges.map((charge) => ({
      id: charge.id,
      description: charge.description,
      amountCents: charge.amountCents,
      createdAt: charge.createdAt.toISOString(),
    })),
    payments: family.payments.map((payment) => ({
      id: payment.id,
      amountCents: payment.amountCents,
      method: payment.method,
      note: payment.note,
      paidOn: isoDay(payment.paidOn),
    })),
    volunteer: volunteerSummary(family),
  };
}

export async function readFamilyOverview(coopId: string) {
  const coop = await prisma.coop.findUniqueOrThrow({
    where: { id: coopId },
    select: { familyFeeCents: true, childFeeCents: true, volunteerMinutesRequired: true },
  });
  const [families, classes] = await Promise.all([
    prisma.coopFamily.findMany({
      where: { coopId },
      include: familyInclude,
      orderBy: { parentName: 'asc' },
    }),
    prisma.coopClass.findMany({
      where: { coopId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        capacity: true,
        feeCents: true,
        enrollments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            status: true,
            child: { select: { name: true, family: { select: { id: true, parentName: true } } } },
          },
        },
      },
    }),
  ]);
  const rosters: ClassRoster[] = classes.map((item) => ({
    id: item.id,
    name: item.name,
    capacity: item.capacity,
    feeCents: item.feeCents,
    enrolled: item.enrollments.filter((entry) => entry.status === 'ENROLLED').length,
    waitlisted: item.enrollments.filter((entry) => entry.status === 'WAITLISTED').length,
    roster: item.enrollments.map((entry) => ({
      enrollmentId: entry.id,
      childName: entry.child.name,
      familyId: entry.child.family.id,
      familyName: entry.child.family.parentName,
      status: entry.status === 'ENROLLED' ? 'enrolled' : 'waitlisted',
    })),
  }));
  return FamilyOverview.parse({
    families: families.map((family) => toFamilyRecord(family, coop)),
    classes: rosters,
    volunteerMinutesRequired: coop.volunteerMinutesRequired,
  });
}

/** Everything a family sees on their private page. */
export async function readFamilyHome(accessToken: string) {
  const family = await prisma.coopFamily.findUnique({
    where: { accessToken },
    include: { ...familyInclude, coop: true },
  });
  if (!family) return null;
  const { coop } = family;
  const enrolledClassIds = family.children.flatMap((child) =>
    child.enrollments.filter((entry) => entry.status === 'ENROLLED').map((entry) => entry.classId),
  );
  const allClassIds = family.children.flatMap((child) =>
    child.enrollments.map((entry) => entry.classId),
  );
  const [schedule, counts, announcements, waitlists, attendance] = await Promise.all([
    readPublicSchedule(coop.id),
    seatCounts(allClassIds),
    prisma.coopAnnouncement.findMany({
      where: {
        coopId: coop.id,
        OR: [{ classId: null }, { classId: { in: enrolledClassIds } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { class: { select: { name: true } } },
    }),
    prisma.coopEnrollment.findMany({
      where: { classId: { in: allClassIds }, status: 'WAITLISTED' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, classId: true },
    }),
    prisma.coopAttendance.findMany({
      where: { child: { familyId: family.id } },
      orderBy: { date: 'desc' },
      include: { child: { select: { name: true } } },
    }),
  ]);
  const positions = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const entry of waitlists) {
    const next = (seen.get(entry.classId) ?? 0) + 1;
    seen.set(entry.classId, next);
    positions.set(entry.id, next);
  }
  const balance = familyBalance(family, coop);
  const volunteer = volunteerSummary(family);
  return FamilyHome.parse({
    coopName: coop.name,
    parentName: family.parentName,
    email: family.email,
    children: family.children.map((child) => ({
      id: child.id,
      name: child.name,
      ageGroup: child.ageGroup,
      enrollments: child.enrollments.map((entry) => ({
        id: entry.id,
        classId: entry.classId,
        status: entry.status === 'ENROLLED' ? 'enrolled' : 'waitlisted',
        waitlistPosition: positions.get(entry.id) ?? null,
        class: toPublicClass(entry.class, counts),
      })),
    })),
    schedule,
    registrationOpen: coop.registrationOpen,
    announcements: announcements.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      className: item.class?.name ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
    fees: {
      ...balance,
      payments: family.payments.map((payment) => ({
        amountCents: payment.amountCents,
        method: payment.method,
        paidOn: isoDay(payment.paidOn),
      })),
      paymentInstructions: coop.paymentInstructions,
    },
    volunteer: { requiredMinutes: coop.volunteerMinutesRequired, ...volunteer },
    calendarUrl: calendarReady(coop) ? familyCalendarUrl(accessToken) : null,
    attendance: {
      present: attendance.filter((entry) => entry.status === 'PRESENT').length,
      absent: attendance.filter((entry) => entry.status === 'ABSENT').length,
      recent: attendance.slice(0, 20).map((entry) => ({
        date: isoDay(entry.date),
        childName: entry.child.name,
        status: entry.status === 'PRESENT' ? 'present' : 'absent',
      })),
    },
  });
}

export { coopCalendarUrl };
