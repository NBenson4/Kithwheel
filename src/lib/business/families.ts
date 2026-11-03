// Families, grade sections, each child's schedule, and registration.
//
// A child belongs to one grade section and takes that section's whole schedule. Coordinators
// make case-by-case changes per child: skip one of the section's classes, or take a single
// class from another section. Families see only approved section schedules.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { entitlement } from '@/lib/billing/entitlement';
import { newToken } from '@/lib/business/tokens';
import type { FamilyCreate, PublicClass, PublicSchedule } from '@/lib/contracts/coop-features';
import { computeBalance } from '@/lib/coop/money';
import { DEFAULT_SECTIONS, effectiveClasses } from '@/lib/coop/placement';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { familyWelcomeEmail } from '@/lib/email/templates';
import { siteUrl } from '@/lib/site';

type Tx = Prisma.TransactionClient;

export const familyUrl = (token: string) => `${siteUrl}/f/${token}`;
export const shareUrl = (token: string) => `${siteUrl}/c/${token}`;
export const kioskUrl = (token: string) => `${siteUrl}/k/${token}`;
export const coopCalendarUrl = (token: string) =>
  `${siteUrl}/api/public/coops/${token}/calendar.ics`;
export const familyCalendarUrl = (token: string) =>
  `${siteUrl}/api/public/families/${token}/calendar.ics`;

export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const billingSelect = {
  trialEndsAt: true,
  stripeSubscriptionId: true,
  subscriptionStatus: true,
  subscriptionInterval: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
} as const;

/** Whether the co-op's plan lets families register and log hours right now. */
export async function coopIsActive(coopId: string): Promise<boolean> {
  const coop = await prisma.coop.findUnique({ where: { id: coopId }, select: billingSelect });
  return coop ? entitlement(coop).canEdit : false;
}

export const PAUSED_MESSAGE =
  'This co-op’s Kithwheel workspace is paused right now. Please contact your coordinator.';

// ── Sections ────────────────────────────────────────────────────────────────

/** Creates the nine default grade sections for a new co-op. */
export async function createDefaultSections(tx: Tx, coopId: string) {
  await tx.coopSection.createMany({
    data: DEFAULT_SECTIONS.map((name, position) => ({ coopId, name, position })),
  });
}

export const classSelect = {
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
} as const;

type ClassRow = Prisma.CoopClassGetPayload<{ select: typeof classSelect }>;

export const toPublicClass = (row: ClassRow): PublicClass => ({
  id: row.id,
  name: row.name,
  description: row.description,
  teacher: row.teacher,
  room: row.room,
  time: row.time,
  materials: row.materials,
  feeCents: row.feeCents,
});

/** A co-op's sections in order, with their classes in schedule order. */
export async function readSectionRows(coopId: string) {
  return prisma.coopSection.findMany({
    where: { coopId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: {
      classes: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: classSelect },
      _count: { select: { children: true } },
    },
  });
}

/** The approved section schedules families can see. */
export async function readPublicSchedule(coopId: string): Promise<PublicSchedule> {
  const sections = await readSectionRows(coopId);
  return {
    sections: sections
      .filter((section) => section.status === 'APPROVED' && section.classes.length)
      .map((section) => ({ name: section.name, classes: section.classes.map(toPublicClass) })),
  };
}

// ── Each child's schedule ───────────────────────────────────────────────────

const sectionWithClasses = {
  select: {
    id: true,
    name: true,
    status: true,
    classes: {
      orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }],
      select: classSelect,
    },
  },
} satisfies Prisma.CoopSectionDefaultArgs;

export const childInclude = {
  section: sectionWithClasses,
  exceptions: {
    orderBy: { createdAt: 'asc' },
    include: {
      class: {
        select: { ...classSelect, section: { select: { name: true, status: true } } },
      },
    },
  },
} satisfies Prisma.CoopChildInclude;

export type ChildWithSchedule = Prisma.CoopChildGetPayload<{ include: typeof childInclude }>;

/**
 * The classes a child takes. With `approvedOnly` (family-facing pages), classes from
 * sections that aren't approved yet are left out.
 */
export function childSchedule(child: ChildWithSchedule, options: { approvedOnly: boolean }) {
  const sectionVisible = child.section
    ? !options.approvedOnly || child.section.status === 'APPROVED'
    : false;
  const ownClasses = sectionVisible && child.section ? child.section.classes : [];
  const exceptions = child.exceptions
    .filter(
      (entry) =>
        entry.kind === 'SKIP' ||
        !options.approvedOnly ||
        entry.class.section?.status === 'APPROVED',
    )
    .map((entry) => ({ kind: entry.kind, class: entry.class }));
  const effective = effectiveClasses({ sectionClasses: ownClasses, exceptions });
  const sectionNames = new Map(
    child.exceptions.map((entry) => [entry.class.id, entry.class.section?.name ?? null]),
  );
  return effective.map(({ item, source }) => ({
    item,
    source,
    sectionName:
      source === 'section' ? (child.section?.name ?? null) : (sectionNames.get(item.id) ?? null),
  }));
}

// ── Registration ────────────────────────────────────────────────────────────

export type RegistrationOutcome =
  | { status: 'registered'; familyId: string; accessToken: string }
  | { status: 'already_registered'; accessToken: string; parentName: string };

/**
 * Creates a family and its children. Families give each child's grade, which is kept as a
 * request; only coordinators put children into sections (`source: 'coordinator'` may pass a
 * section id directly).
 */
export async function registerFamily(
  coopId: string,
  input: FamilyCreate,
  options: { source: 'public' | 'coordinator' },
): Promise<RegistrationOutcome | { status: 'invalid'; message: string }> {
  const existing = await prisma.coopFamily.findUnique({
    where: { coopId_email: { coopId, email: input.email } },
    select: { accessToken: true, parentName: true },
  });
  if (existing) return { status: 'already_registered', ...existing };

  const sectionIds =
    options.source === 'coordinator'
      ? [
          ...new Set(
            input.children
              .map((child) => child.sectionId)
              .filter((id): id is string => Boolean(id)),
          ),
        ]
      : [];
  if (sectionIds.length) {
    const found = await prisma.coopSection.count({ where: { coopId, id: { in: sectionIds } } });
    if (found !== sectionIds.length) {
      return { status: 'invalid', message: 'One of those sections no longer exists.' };
    }
  }

  const accessToken = newToken();
  try {
    return await prisma.$transaction(async (tx) => {
      const family = await tx.coopFamily.create({
        data: {
          coopId,
          parentName: input.parentName,
          email: input.email,
          phone: input.phone || null,
          accessToken,
        },
      });
      await tx.coopChild.createMany({
        data: input.children.map((child) => ({
          coopId,
          familyId: family.id,
          name: child.name,
          requestedSection: child.grade || null,
          sectionId: options.source === 'coordinator' ? child.sectionId || null : null,
        })),
      });
      return { status: 'registered' as const, familyId: family.id, accessToken };
    });
  } catch (error) {
    // Two submissions with the same email at once: the unique index catches the second.
    if ((error as { code?: string }).code === 'P2002') {
      const family = await prisma.coopFamily.findUnique({
        where: { coopId_email: { coopId, email: input.email } },
        select: { accessToken: true, parentName: true },
      });
      if (family) return { status: 'already_registered', ...family };
    }
    throw error;
  }
}

export async function sendFamilyWelcome(
  coopName: string,
  input: FamilyCreate,
  outcome: Extract<RegistrationOutcome, { status: 'registered' }>,
  replyTo?: string,
) {
  await sendEmail({
    to: input.email,
    replyTo,
    ...familyWelcomeEmail({
      coopName,
      parentName: input.parentName,
      url: familyUrl(outcome.accessToken),
      children: input.children.map((child) => child.name),
    }),
  });
}

/** Coordinators' emails, so families' replies reach a person. */
export async function coordinatorEmails(coopId: string): Promise<string[]> {
  const memberships = await prisma.coopMembership.findMany({
    where: { coopId, role: 'coordinator' },
    select: { userId: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: memberships.map((item) => item.userId) } },
    select: { email: true },
  });
  return users.map((user) => user.email);
}

// ── Balances and hours ──────────────────────────────────────────────────────

export const familyInclude = {
  children: { orderBy: { createdAt: 'asc' }, include: childInclude },
  charges: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { paidOn: 'asc' } },
  volunteerLogs: { orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] },
} satisfies Prisma.CoopFamilyInclude;

export type FamilyWithDetails = Prisma.CoopFamilyGetPayload<{ include: typeof familyInclude }>;

/** Fees: the family fee, a per-child fee, and the fee of every class each child takes. */
export function familyBalance(
  family: FamilyWithDetails,
  coop: { familyFeeCents: number; childFeeCents: number },
) {
  return computeBalance({
    familyFeeCents: coop.familyFeeCents,
    childFeeCents: coop.childFeeCents,
    childCount: family.children.length,
    classFees: family.children.flatMap((child) =>
      childSchedule(child, { approvedOnly: false })
        .filter(({ item }) => item.feeCents)
        .map(({ item }) => ({ label: `${item.name} (${child.name})`, amountCents: item.feeCents })),
    ),
    charges: family.charges.map((charge) => ({
      label: charge.description,
      amountCents: charge.amountCents,
    })),
    paymentsCents: family.payments.map((payment) => payment.amountCents),
  });
}

export function volunteerSummary(family: FamilyWithDetails) {
  let approvedMinutes = 0;
  let pendingMinutes = 0;
  for (const log of family.volunteerLogs) {
    if (log.status === 'APPROVED') approvedMinutes += log.minutes;
    if (log.status === 'PENDING') pendingMinutes += log.minutes;
  }
  return {
    approvedMinutes,
    pendingMinutes,
    logs: family.volunteerLogs.map((log) => ({
      id: log.id,
      date: isoDay(log.date),
      minutes: log.minutes,
      description: log.description,
      status: log.status.toLowerCase() as 'pending' | 'approved' | 'declined',
      addedByCoordinator: log.addedByCoordinator,
    })),
  };
}
