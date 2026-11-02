// Update a schedule's title and ordered rotations.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { readScheduleList } from '@/lib/business/schedule-data';
import { ScheduleList, ScheduleUpdate } from '@/lib/contracts/coops';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

type RouteContext = { params: Promise<{ coopId: string; scheduleId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { coopId, scheduleId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;

  try {
    const parsed = ScheduleUpdate.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    const schedule = await prisma.coopSchedule.findFirst({
      where: { id: scheduleId, coopId },
      select: { id: true },
    });
    if (!schedule) return NextResponse.json({ error: 'schedule_not_found' }, { status: 404 });

    if (parsed.data.rotations) {
      const classIds = parsed.data.rotations.flatMap((rotation) => rotation.classIds);
      if (new Set(classIds).size !== classIds.length) {
        return NextResponse.json(
          { error: 'Each class may appear only once in a schedule' },
          { status: 400 },
        );
      }
      if (classIds.length > 0) {
        const count = await prisma.coopClass.count({ where: { coopId, id: { in: classIds } } });
        if (count !== classIds.length)
          return NextResponse.json({ error: 'class_outside_coop' }, { status: 400 });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.coop.updateMany({
        where: { id: coopId, currentScheduleId: scheduleId },
        data: { currentScheduleId: null },
      });
      await tx.coopSchedule.update({
        where: { id: scheduleId },
        data: {
          ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
          status: 'DRAFT',
          publishedAt: null,
          withdrawnAt: null,
          ...(parsed.data.rotations
            ? {
                rotations: {
                  deleteMany: {},
                  create: parsed.data.rotations.map((rotation, position) => ({
                    ageGroup: rotation.ageGroup,
                    position,
                    entries: {
                      create: rotation.classIds.map((classId, entryPosition) => ({
                        classId,
                        position: entryPosition,
                      })),
                    },
                  })),
                },
              }
            : {}),
        },
      });
    });
    return NextResponse.json(ScheduleList.parse(await readScheduleList(coopId)));
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
