// Response shaping for the coordinator's sections, families, settings and team views, and for
// the family-facing pages.
import 'server-only';
import {
  type ChildWithSchedule,
  childSchedule,
  coopCalendarUrl,
  type FamilyWithDetails,
  familyBalance,
  familyCalendarUrl,
  familyInclude,
  familyUrl,
  isoDay,
  kioskUrl,
  readPublicSchedule,
  readSectionRows,
  shareUrl,
  toPublicClass,
  volunteerSummary,
} from '@/lib/business/families';
import {
  type ChildRecord,
  CoopSettings,
  FamilyHome,
  FamilyOverview,
  type FamilyRecord,
} from '@/lib/contracts/coop-features';
import { SectionList } from '@/lib/contracts/coops';
import { clashes } from '@/lib/coop/placement';
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
  const [classes, classFees, families, coordinators, pendingInvites, sections] = await Promise.all([
    prisma.coopClass.count({ where: { coopId } }),
    prisma.coopClass.count({ where: { coopId, feeCents: { gt: 0 } } }),
    prisma.coopFamily.count({ where: { coopId } }),
    prisma.coopMembership.count({ where: { coopId, role: 'coordinator' } }),
    prisma.coopInvite.count({
      where: { coopId, acceptedAt: null, expiresAt: { gt: new Date() } },
    }),
    prisma.coopSection.findMany({
      where: { coopId },
      select: { status: true, _count: { select: { classes: true } } },
    }),
  ]);
  return CoopSettings.parse({
    shareUrl: coop.shareToken ? shareUrl(coop.shareToken) : null,
    kioskUrl: coop.kioskToken ? kioskUrl(coop.kioskToken) : null,
    registrationOpen: coop.registrationOpen,
    registrationNote: coop.registrationNote,
    timeZone: coop.timeZone,
    meetingDay: coop.meetingDay,
    termStart: coop.termStart ? isoDay(coop.termStart) : null,
    termEnd: coop.termEnd ? isoDay(coop.termEnd) : null,
    familyFeeCents: coop.familyFeeCents,
    childFeeCents: coop.childFeeCents,
    paymentInstructions: coop.paymentInstructions,
    volunteerMinutesRequired: coop.volunteerMinutesRequired,
    sectionsApproved: sections.filter(
      (section) => section.status === 'APPROVED' && section._count.classes,
    ).length,
    sectionsWithClasses: sections.filter((section) => section._count.classes).length,
    counts: { classes, classFees, families, coordinators, pendingInvites },
  });
}

/** Sections with their classes, for the Schedules tab. */
export async function readSections(coopId: string) {
  const [sections, unfiled] = await Promise.all([
    readSectionRows(coopId),
    prisma.coopClass.findMany({
      where: { coopId, sectionId: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        coopId: true,
        sectionId: true,
        position: true,
        name: true,
        description: true,
        teacher: true,
        room: true,
        time: true,
        materials: true,
        feeCents: true,
        capacity: true,
      },
    }),
  ]);
  return SectionList.parse({
    items: sections.map((section) => ({
      id: section.id,
      name: section.name,
      position: section.position,
      status: section.status === 'APPROVED' ? 'approved' : 'draft',
      approvedAt: section.approvedAt?.toISOString() ?? null,
      childCount: section._count.children,
      classes: section.classes,
    })),
    unfiledClasses: unfiled,
  });
}

export function toChildRecord(child: ChildWithSchedule): ChildRecord {
  const schedule = childSchedule(child, { approvedOnly: false });
  return {
    id: child.id,
    name: child.name,
    sectionId: child.sectionId,
    sectionName: child.section?.name ?? null,
    requestedSection: child.requestedSection,
    classes: schedule.map(({ item, source, sectionName }) => ({
      classId: item.id,
      className: item.name,
      time: item.time,
      sectionName,
      source,
    })),
    skipped: child.exceptions
      .filter((entry) => entry.kind === 'SKIP' && entry.class.sectionId === child.sectionId)
      .map((entry) => ({ classId: entry.class.id, className: entry.class.name })),
    clashes: clashes(schedule.map(({ item }) => item)),
  };
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
    children: family.children.map(toChildRecord),
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
  const [families, sections] = await Promise.all([
    prisma.coopFamily.findMany({
      where: { coopId },
      include: familyInclude,
      orderBy: { parentName: 'asc' },
    }),
    readSectionRows(coopId),
  ]);
  const records = families.map((family) => toFamilyRecord(family, coop));
  const counts = new Map<string, number>();
  for (const family of records) {
    for (const child of family.children) {
      for (const item of child.classes)
        counts.set(item.classId, (counts.get(item.classId) ?? 0) + 1);
    }
  }
  return FamilyOverview.parse({
    families: records,
    sections: sections.map((section) => ({
      id: section.id,
      name: section.name,
      status: section.status === 'APPROVED' ? 'approved' : 'draft',
      classes: section.classes.map((item) => ({
        id: item.id,
        name: item.name,
        time: item.time,
        capacity: item.capacity,
        count: counts.get(item.id) ?? 0,
      })),
    })),
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
  const childSchedules = family.children.map((child) => ({
    child,
    schedule: childSchedule(child, { approvedOnly: true }),
  }));
  const classIds = childSchedules.flatMap(({ schedule }) => schedule.map(({ item }) => item.id));
  const sectionIds = family.children
    .map((child) => child.sectionId)
    .filter((id): id is string => Boolean(id));
  const [schedule, sections, announcements, attendance] = await Promise.all([
    readPublicSchedule(coop.id),
    prisma.coopSection.findMany({
      where: { coopId: coop.id },
      orderBy: { position: 'asc' },
      select: { name: true },
    }),
    prisma.coopAnnouncement.findMany({
      where: {
        coopId: coop.id,
        OR: [
          { classId: null, sectionId: null },
          { classId: { in: classIds } },
          { sectionId: { in: sectionIds } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { class: { select: { name: true } }, section: { select: { name: true } } },
    }),
    prisma.coopAttendance.findMany({
      where: { child: { familyId: family.id } },
      orderBy: { date: 'desc' },
      include: { child: { select: { name: true } } },
    }),
  ]);
  const balance = familyBalance(family, coop);
  const volunteer = volunteerSummary(family);
  return FamilyHome.parse({
    coopName: coop.name,
    parentName: family.parentName,
    email: family.email,
    grades: sections.map((section) => section.name),
    children: childSchedules.map(({ child, schedule: classes }) => ({
      id: child.id,
      name: child.name,
      sectionName: child.section?.name ?? null,
      awaitingApproval: Boolean(child.section && child.section.status !== 'APPROVED'),
      classes: classes.map(({ item, source, sectionName }) => ({
        ...toPublicClass(item),
        source,
        sectionName,
      })),
    })),
    schedule,
    registrationOpen: coop.registrationOpen,
    announcements: announcements.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      className: item.class?.name ?? null,
      sectionName: item.section?.name ?? null,
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
