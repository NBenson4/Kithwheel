// Copy a schedule (usually last term's) into a new draft with the same rotations.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin, notFound, serverError } from '@/lib/business/route-helpers';
import { readScheduleList } from '@/lib/business/schedule-data';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; scheduleId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, scheduleId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const source = await prisma.coopSchedule.findFirst({
    where: { id: scheduleId, coopId },
    include: { rotations: { orderBy: { position: 'asc' }, include: { entries: true } } },
  });
  if (!source) return notFound('Schedule');
  try {
    const title = `${source.title} (copy)`.slice(0, 120);
    const created = await prisma.coopSchedule.create({
      data: {
        coopId,
        title,
        rotations: {
          create: source.rotations.map((rotation) => ({
            ageGroup: rotation.ageGroup,
            position: rotation.position,
            entries: {
              create: rotation.entries.map((entry) => ({
                classId: entry.classId,
                position: entry.position,
              })),
            },
          })),
        },
      },
      select: { id: true },
    });
    return NextResponse.json(
      { ...(await readScheduleList(coopId)), createdId: created.id },
      {
        status: 201,
      },
    );
  } catch {
    return serverError();
  }
}
