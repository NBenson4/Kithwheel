// The co-op's family link: approved section schedules and whether registration is open.
import 'server-only';
import { NextResponse } from 'next/server';
import { calendarReady, coopCalendarUrl } from '@/lib/business/coop-views';
import { readPublicSchedule } from '@/lib/business/families';
import { coopByShareToken, linkNotFound, noStore } from '@/lib/business/public-access';
import { PublicCoop } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ token: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const coop = await coopByShareToken(token);
  if (!coop) return linkNotFound();
  const [schedule, sections] = await Promise.all([
    readPublicSchedule(coop.id),
    prisma.coopSection.findMany({
      where: { coopId: coop.id },
      orderBy: { position: 'asc' },
      select: { name: true },
    }),
  ]);
  return NextResponse.json(
    PublicCoop.parse({
      name: coop.name,
      schedule,
      grades: sections.map((section) => section.name),
      registration: { open: coop.registrationOpen, note: coop.registrationNote },
      fees: { familyFeeCents: coop.familyFeeCents, childFeeCents: coop.childFeeCents },
      meetingDay: coop.meetingDay,
      calendarUrl: calendarReady(coop) ? coopCalendarUrl(token) : null,
    }),
    { headers: noStore },
  );
}
