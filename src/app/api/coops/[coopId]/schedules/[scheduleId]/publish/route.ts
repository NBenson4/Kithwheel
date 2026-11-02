// Publish one complete schedule as the co-op's current plan.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopCoordinator } from '@/lib/business/coordinator-auth';
import { readScheduleList } from '@/lib/business/schedule-data';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

type RouteContext = { params: Promise<{ coopId: string; scheduleId: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { coopId, scheduleId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;

  const schedule = await prisma.coopSchedule.findFirst({
    where: { id: scheduleId, coopId },
    include: { rotations: { include: { entries: true } } },
  });
  if (!schedule) return NextResponse.json({ error: 'schedule_not_found' }, { status: 404 });
  if (
    schedule.rotations.length === 0 ||
    schedule.rotations.some((rotation) => rotation.entries.length === 0)
  ) {
    return NextResponse.json(
      { error: 'Add an age group and at least one class to every rotation before publishing.' },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.coop.update({ where: { id: coopId }, data: { currentScheduleId: scheduleId } });
    await tx.coopSchedule.updateMany({
      where: { coopId, status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });
    await tx.coopSchedule.update({
      where: { id: scheduleId },
      data: { status: 'PUBLISHED', publishedAt: new Date(), withdrawnAt: null },
    });
  });

  return NextResponse.json(await readScheduleList(coopId));
}
