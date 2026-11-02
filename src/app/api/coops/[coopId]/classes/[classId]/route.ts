// Edit or delete class records only inside their coordinator's co-op.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { CoopClassList, CoopClassUpdate, DeletedRecord } from '@/lib/contracts/coops';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

type RouteContext = { params: Promise<{ coopId: string; classId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { coopId, classId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;

  try {
    const parsed = CoopClassUpdate.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    const data = {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description || null }
        : {}),
      ...(parsed.data.teacher !== undefined ? { teacher: parsed.data.teacher || null } : {}),
      ...(parsed.data.room !== undefined ? { room: parsed.data.room || null } : {}),
      ...(parsed.data.time !== undefined ? { time: parsed.data.time || null } : {}),
    };
    const result = await prisma.coopClass.updateMany({ where: { id: classId, coopId }, data });
    if (result.count === 0) return NextResponse.json({ error: 'class_not_found' }, { status: 404 });
    const updated = await prisma.coopClass.findFirst({ where: { id: classId, coopId } });
    if (!updated) return NextResponse.json({ error: 'class_not_found' }, { status: 404 });
    return NextResponse.json(CoopClassList.shape.items.element.parse(updated));
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { coopId, classId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;

  try {
    const item = await prisma.coopClass.findFirst({
      where: { id: classId, coopId },
      select: { id: true, name: true },
    });
    if (!item) return NextResponse.json({ error: 'class_not_found' }, { status: 404 });

    // Deleting would silently change what families see, so a class in a published
    // schedule has to be taken out of that schedule first.
    const published = await prisma.coopSchedule.findFirst({
      where: {
        coopId,
        status: 'PUBLISHED',
        rotations: { some: { entries: { some: { classId } } } },
      },
      select: { title: true },
    });
    if (published) {
      return NextResponse.json(
        {
          error: `“${item.name}” is in the published schedule “${published.title}”. Remove it from that schedule first.`,
        },
        { status: 409 },
      );
    }

    // Draft and past schedules lose the class through the cascade on schedule entries.
    await prisma.coopClass.deleteMany({ where: { id: classId, coopId } });
    return NextResponse.json(DeletedRecord.parse({ id: classId }));
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
