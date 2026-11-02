// The co-op's family link: current schedule and whether registration is open.
import 'server-only';
import { NextResponse } from 'next/server';
import { calendarReady, coopCalendarUrl } from '@/lib/business/coop-views';
import { readPublicSchedule } from '@/lib/business/families';
import { coopByShareToken, linkNotFound, noStore } from '@/lib/business/public-access';
import { PublicCoop } from '@/lib/contracts/coop-features';

type RouteContext = { params: Promise<{ token: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const coop = await coopByShareToken(token);
  if (!coop) return linkNotFound();
  const schedule = await readPublicSchedule(coop.id);
  return NextResponse.json(
    PublicCoop.parse({
      name: coop.name,
      schedule,
      registration: {
        open: coop.registrationOpen && schedule !== null,
        note: coop.registrationNote,
      },
      fees: { familyFeeCents: coop.familyFeeCents, childFeeCents: coop.childFeeCents },
      meetingDay: coop.meetingDay,
      calendarUrl: calendarReady(coop) ? coopCalendarUrl(token) : null,
    }),
    { headers: noStore },
  );
}
