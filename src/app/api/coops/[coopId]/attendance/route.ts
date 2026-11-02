// Attendance for one co-op day, and coordinator check-in actions.
import 'server-only';
import { NextResponse } from 'next/server';
import { markAttendance, readAttendanceDay, todayIn } from '@/lib/business/attendance';
import { requireCoopCoordinator, requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { AttendanceMark } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string }> };

export const dynamic = 'force-dynamic';

async function timeZoneOf(coopId: string) {
  const coop = await prisma.coop.findUniqueOrThrow({
    where: { id: coopId },
    select: { timeZone: true },
  });
  return coop.timeZone;
}

export async function GET(request: Request, context: RouteContext) {
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;
  const timeZone = await timeZoneOf(coopId);
  const requested = new URL(request.url).searchParams.get('date');
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : todayIn(timeZone);
  return NextResponse.json(await readAttendanceDay(coopId, date, timeZone));
}

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, AttendanceMark);
  if (!body.ok) return body.response;
  try {
    const marked = await markAttendance(
      coopId,
      body.data.childId,
      body.data.date,
      body.data.action,
      'coordinator',
    );
    if (!marked) return notFound('Child');
    return NextResponse.json(
      await readAttendanceDay(coopId, body.data.date, await timeZoneOf(coopId)),
    );
  } catch {
    return serverError();
  }
}
