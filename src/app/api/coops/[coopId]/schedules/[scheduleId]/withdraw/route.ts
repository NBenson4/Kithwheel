// Withdraw a schedule and clear the co-op's current pointer.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { readScheduleList } from '@/lib/business/schedule-data';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

type RouteContext = { params: Promise<{ coopId: string; scheduleId: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { coopId, scheduleId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;

  const schedule = await prisma.coopSchedule.findFirst({ where: { id: scheduleId, coopId } });
  if (!schedule) return NextResponse.json({ error: 'schedule_not_found' }, { status: 404 });
  if (schedule.status !== 'PUBLISHED') {
    return NextResponse.json(
      { error: 'Only the current published schedule can be withdrawn.' },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.coop.updateMany({
      where: { id: coopId, currentScheduleId: scheduleId },
      data: { currentScheduleId: null },
    }),
    prisma.coopSchedule.update({
      where: { id: scheduleId },
      data: { status: 'WITHDRAWN', withdrawnAt: new Date(), publishedAt: null },
    }),
  ]);
  return NextResponse.json(await readScheduleList(coopId));
}
