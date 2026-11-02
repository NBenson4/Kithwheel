// Families, registration, waitlists, and the data shown on family-facing pages.
import 'server-only';
import type { Prisma } from '@prisma/client';
import { entitlement } from '@/lib/billing/entitlement';
import { newToken } from '@/lib/business/tokens';
import type { FamilyCreate, PublicClass, PublicSchedule } from '@/lib/contracts/coop-features';
import { computeBalance } from '@/lib/coop/money';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { familyWelcomeEmail, seatOpenedEmail } from '@/lib/email/templates';
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

// ── Seats and waitlists ─────────────────────────────────────────────────────

export type Promotion = {
  coopName: string;
  parentName: string;
  email: string;
  accessToken: string;
  childName: string;
  className: string;
};

/**
 * Moves waitlisted children into any open seats, oldest sign-up first. Call it inside the
 * transaction that freed seats (dropped enrollment, deleted family, raised capacity).
 */
export async function fillOpenSeats(tx: Tx, classIds: string[]): Promise<Promotion[]> {
  const promotions: Promotion[] = [];
  for (const classId of [...new Set(classIds)]) {
    await tx.$queryRaw`SELECT id FROM "CoopClass" WHERE id = ${classId} FOR UPDATE`;
    const item = await tx.coopClass.findUnique({
      where: { id: classId },
      select: { name: true, capacity: true, coop: { select: { name: true } } },
    });
    if (!item) continue;
    const enrolled = await tx.coopEnrollment.count({ where: { classId, status: 'ENROLLED' } });
    const open = item.capacity === null ? Number.POSITIVE_INFINITY : item.capacity - enrolled;
    if (open <= 0) continue;
    const waiting = await tx.coopEnrollment.findMany({
      where: { classId, status: 'WAITLISTED' },
      orderBy: { createdAt: 'asc' },
      take: Number.isFinite(open) ? open : undefined,
      include: { child: { include: { family: true } } },
    });
    for (const entry of waiting) {
      await tx.coopEnrollment.update({
        where: { id: entry.id },
        data: { status: 'ENROLLED', promotedAt: new Date() },
      });
      promotions.push({
        coopName: item.coop.name,
        parentName: entry.child.family.parentName,
        email: entry.child.family.email,
        accessToken: entry.child.family.accessToken,
        childName: entry.child.name,
        className: item.name,
      });
    }
  }
  return promotions;
}

/** Emails families whose child moved off a waitlist. Failures don't undo the promotion. */
export async function notifyPromotions(promotions: Promotion[]) {
  await Promise.allSettled(
    promotions.map((item) =>
      sendEmail({
        to: item.email,
        ...seatOpenedEmail({
          coopName: item.coopName,
          parentName: item.parentName,
          childName: item.childName,
          className: item.className,
          url: familyUrl(item.accessToken),
        }),
      }),
    ),
  );
}

/** Adds a child to a class, or to its waitlist when it's full. Locks the class row. */
export async function placeChild(tx: Tx, coopId: string, childId: string, classId: string) {
  await tx.$queryRaw`SELECT id FROM "CoopClass" WHERE id = ${classId} FOR UPDATE`;
  const item = await tx.coopClass.findFirst({
    where: { id: classId, coopId },
    select: { name: true, capacity: true },
  });
  if (!item) return null;
  const enrolled = await tx.coopEnrollment.count({ where: { classId, status: 'ENROLLED' } });
  const status = item.capacity !== null && enrolled >= item.capacity ? 'WAITLISTED' : 'ENROLLED';
  const created = await tx.coopEnrollment.upsert({
    where: { childId_classId: { childId, classId } },
    create: { coopId, childId, classId, status },
    update: {},
  });
  return { className: item.name, status: created.status };
}

// ── The current schedule as families see it ─────────────────────────────────

const publicClassSelect = {
  id: true,
  name: true,
  description: true,
  teacher: true,
  room: true,
  time: true,
  materials: true,
  feeCents: true,
  capacity: true,
} as const;

type PublicClassRow = Prisma.CoopClassGetPayload<{ select: typeof publicClassSelect }>;

export async function seatCounts(classIds: string[]) {
  const groups = await prisma.coopEnrollment.groupBy({
    by: ['classId', 'status'],
    where: { classId: { in: classIds } },
    _count: { _all: true },
  });
  const counts = new Map<string, { enrolled: number; waitlisted: number }>();
  for (const group of groups) {
    const current = counts.get(group.classId) ?? { enrolled: 0, waitlisted: 0 };
    if (group.status === 'ENROLLED') current.enrolled = group._count._all;
    else current.waitlisted = group._count._all;
    counts.set(group.classId, current);
  }
  return counts;
}

export function toPublicClass(
  row: PublicClassRow,
  counts: Map<string, { enrolled: number; waitlisted: number }>,
): PublicClass {
  const count = counts.get(row.id) ?? { enrolled: 0, waitlisted: 0 };
  return {
    ...row,
    seatsLeft: row.capacity === null ? null : Math.max(0, row.capacity - count.enrolled),
    waitlisted: count.waitlisted,
  };
}

/** The co-op's current published schedule, with seat counts. Null when nothing is published. */
export async function readPublicSchedule(coopId: string): Promise<PublicSchedule | null> {
  const coop = await prisma.coop.findUnique({
    where: { id: coopId },
    select: { currentScheduleId: true },
  });
  if (!coop?.currentScheduleId) return null;
  const schedule = await prisma.coopSchedule.findFirst({
    where: { id: coop.currentScheduleId, coopId, status: 'PUBLISHED' },
    include: {
      rotations: {
        orderBy: { position: 'asc' },
        include: {
          entries: {
            orderBy: { position: 'asc' },
            include: { class: { select: publicClassSelect } },
          },
        },
      },
    },
  });
  if (!schedule) return null;
  const classIds = schedule.rotations.flatMap((rotation) =>
    rotation.entries.map((entry) => entry.classId),
  );
  const counts = await seatCounts(classIds);
  return {
    title: schedule.title,
    rotations: schedule.rotations.map((rotation) => ({
      ageGroup: rotation.ageGroup,
      classes: rotation.entries.map((entry) => toPublicClass(entry.class, counts)),
    })),
  };
}

/** Ids of classes families may sign up for: those in the current published schedule. */
export async function registrableClassIds(coopId: string): Promise<Set<string>> {
  const schedule = await readPublicSchedule(coopId);
  return new Set(
    schedule?.rotations.flatMap((rotation) => rotation.classes.map((c) => c.id)) ?? [],
  );
}

// ── Registration ────────────────────────────────────────────────────────────

export type RegistrationOutcome =
  | {
      status: 'registered';
      familyId: string;
      accessToken: string;
      enrolled: { childName: string; className: string }[];
      waitlisted: { childName: string; className: string }[];
      promotions: Promotion[];
    }
  | { status: 'already_registered'; accessToken: string; parentName: string }
  | { status: 'invalid'; message: string };

/**
 * Creates a family with its children and class choices. When `allowAnyClass` is false
 * (public registration), choices must come from the current published schedule.
 */
export async function registerFamily(
  coopId: string,
  input: FamilyCreate,
  options: { allowAnyClass: boolean },
): Promise<RegistrationOutcome> {
  const existing = await prisma.coopFamily.findUnique({
    where: { coopId_email: { coopId, email: input.email } },
    select: { accessToken: true, parentName: true },
  });
  if (existing) return { status: 'already_registered', ...existing };

  const requested = input.children.flatMap((child) => child.classIds);
  const allowed = options.allowAnyClass
    ? new Set(
        (
          await prisma.coopClass.findMany({
            where: { coopId, id: { in: requested } },
            select: { id: true },
          })
        ).map((item) => item.id),
      )
    : await registrableClassIds(coopId);
  if (requested.some((id) => !allowed.has(id))) {
    return {
      status: 'invalid',
      message: 'One of the classes is no longer offered. Refresh the page and try again.',
    };
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
      const enrolled: { childName: string; className: string }[] = [];
      const waitlisted: { childName: string; className: string }[] = [];
      for (const childInput of input.children) {
        const child = await tx.coopChild.create({
          data: {
            coopId,
            familyId: family.id,
            name: childInput.name,
            ageGroup: childInput.ageGroup || null,
          },
        });
        for (const classId of [...new Set(childInput.classIds)]) {
          const placed = await placeChild(tx, coopId, child.id, classId);
          if (!placed) continue;
          (placed.status === 'ENROLLED' ? enrolled : waitlisted).push({
            childName: child.name,
            className: placed.className,
          });
        }
      }
      return {
        status: 'registered' as const,
        familyId: family.id,
        accessToken,
        enrolled,
        waitlisted,
        promotions: [],
      };
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
      enrolled: outcome.enrolled,
      waitlisted: outcome.waitlisted,
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
  children: {
    orderBy: { createdAt: 'asc' },
    include: {
      enrollments: {
        orderBy: { createdAt: 'asc' },
        include: { class: { select: publicClassSelect } },
      },
    },
  },
  charges: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { paidOn: 'asc' } },
  volunteerLogs: { orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] },
} satisfies Prisma.CoopFamilyInclude;

export type FamilyWithDetails = Prisma.CoopFamilyGetPayload<{ include: typeof familyInclude }>;

export function familyBalance(
  family: FamilyWithDetails,
  coop: { familyFeeCents: number; childFeeCents: number },
) {
  return computeBalance({
    familyFeeCents: coop.familyFeeCents,
    childFeeCents: coop.childFeeCents,
    childCount: family.children.length,
    classFees: family.children.flatMap((child) =>
      child.enrollments
        .filter((entry) => entry.status === 'ENROLLED' && entry.class.feeCents)
        .map((entry) => ({
          label: `${entry.class.name} (${child.name})`,
          amountCents: entry.class.feeCents,
        })),
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
