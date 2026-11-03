// Morning check-in and attendance.
import 'server-only';
import { isoDay } from '@/lib/business/families';
import { dateOnly } from '@/lib/business/route-helpers';
import { AttendanceDay, AttendanceHistory, KioskDay } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

/** Today's date (YYYY-MM-DD) in the co-op's time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return isoDay(now);
  }
}

const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

async function childrenWithAttendance(
  coopId: string,
  date: string,
  by: 'group' | 'name' = 'group',
) {
  const children = await prisma.coopChild.findMany({
    where: { coopId },
    include: {
      family: { select: { id: true, parentName: true } },
      section: { select: { name: true, position: true } },
      attendance: { where: { date: dateOnly(date) } },
    },
  });
  // In section order (Pre-K first); the tablet lists children by name for parents.
  return children.sort((a, b) =>
    by === 'name'
      ? natural.compare(a.name, b.name)
      : (a.section?.position ?? 999) - (b.section?.position ?? 999) ||
        natural.compare(a.name, b.name),
  );
}

export async function readAttendanceDay(coopId: string, date: string, timeZone: string) {
  const children = await childrenWithAttendance(coopId, date);
  return AttendanceDay.parse({
    date,
    today: todayIn(timeZone),
    children: children.map((child) => {
      const entry = child.attendance[0];
      return {
        childId: child.id,
        childName: child.name,
        familyId: child.family.id,
        familyName: child.family.parentName,
        sectionName: child.section?.name ?? null,
        status: entry ? (entry.status === 'PRESENT' ? 'present' : 'absent') : null,
        checkedInAt: entry?.checkedInAt?.toISOString() ?? null,
        checkedOutAt: entry?.checkedOutAt?.toISOString() ?? null,
        source: entry?.source ?? null,
      };
    }),
  });
}

export type AttendanceAction = 'check_in' | 'check_out' | 'absent' | 'clear' | 'undo';

/** Applies one check-in action. Returns false when the child isn't in this co-op. */
export async function markAttendance(
  coopId: string,
  childId: string,
  date: string,
  action: AttendanceAction,
  source: 'coordinator' | 'kiosk',
): Promise<boolean> {
  const child = await prisma.coopChild.findFirst({ where: { id: childId, coopId } });
  if (!child) return false;
  const where = { childId_date: { childId, date: dateOnly(date) } };
  const now = new Date();
  if (action === 'clear' || action === 'undo') {
    await prisma.coopAttendance.deleteMany({ where: { childId, date: dateOnly(date) } });
    return true;
  }
  if (action === 'check_in') {
    await prisma.coopAttendance.upsert({
      where,
      create: {
        coopId,
        childId,
        date: dateOnly(date),
        status: 'PRESENT',
        checkedInAt: now,
        source,
      },
      update: { status: 'PRESENT', checkedInAt: now, checkedOutAt: null, source },
    });
  } else if (action === 'check_out') {
    await prisma.coopAttendance.upsert({
      where,
      create: {
        coopId,
        childId,
        date: dateOnly(date),
        status: 'PRESENT',
        checkedInAt: now,
        checkedOutAt: now,
        source,
      },
      update: { status: 'PRESENT', checkedOutAt: now },
    });
  } else {
    await prisma.coopAttendance.upsert({
      where,
      create: { coopId, childId, date: dateOnly(date), status: 'ABSENT', source },
      update: { status: 'ABSENT', checkedInAt: null, checkedOutAt: null, source },
    });
  }
  return true;
}

export async function readAttendanceHistory(coopId: string) {
  const [entries, children] = await Promise.all([
    prisma.coopAttendance.findMany({
      where: { coopId },
      select: { date: true, status: true, childId: true },
    }),
    prisma.coopChild.findMany({
      where: { coopId },
      orderBy: { name: 'asc' },
      include: { family: { select: { parentName: true } } },
    }),
  ]);
  const days = new Map<string, { present: number; absent: number }>();
  const perChild = new Map<string, { present: number; absent: number }>();
  for (const entry of entries) {
    const day = isoDay(entry.date);
    const dayCount = days.get(day) ?? { present: 0, absent: 0 };
    const childCount = perChild.get(entry.childId) ?? { present: 0, absent: 0 };
    const key = entry.status === 'PRESENT' ? 'present' : 'absent';
    dayCount[key] += 1;
    childCount[key] += 1;
    days.set(day, dayCount);
    perChild.set(entry.childId, childCount);
  }
  return AttendanceHistory.parse({
    days: [...days.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, count]) => ({ date, ...count })),
    children: children.map((child) => ({
      childId: child.id,
      childName: child.name,
      familyName: child.family.parentName,
      ...(perChild.get(child.id) ?? { present: 0, absent: 0 }),
    })),
  });
}

export async function readKioskDay(coop: { id: string; name: string; timeZone: string }) {
  const date = todayIn(coop.timeZone);
  const children = await childrenWithAttendance(coop.id, date, 'name');
  return KioskDay.parse({
    coopName: coop.name,
    date,
    children: children.map((child) => {
      const entry = child.attendance[0];
      return {
        childId: child.id,
        name: child.name,
        familyName: child.family.parentName,
        sectionName: child.section?.name ?? null,
        checkedInAt:
          entry?.status === 'PRESENT' ? (entry.checkedInAt?.toISOString() ?? null) : null,
        checkedOutAt: entry?.checkedOutAt?.toISOString() ?? null,
      };
    }),
  });
}
