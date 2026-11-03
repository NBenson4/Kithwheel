// Edit, move (to another section) or delete a class inside the coordinator's co-op.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { CoopClassList, CoopClassUpdate, DeletedRecord } from '@/lib/contracts/coops';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; classId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, classId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, CoopClassUpdate);
  if (!body.ok) return body.response;
  const item = await prisma.coopClass.findFirst({ where: { id: classId, coopId } });
  if (!item) return notFound('Class');
  const moving = body.data.sectionId !== undefined && body.data.sectionId !== item.sectionId;
  if (moving) {
    const section = await prisma.coopSection.findFirst({
      where: { id: body.data.sectionId, coopId },
    });
    if (!section) return notFound('Section');
  }
  try {
    const last = moving
      ? await prisma.coopClass.findFirst({
          where: { sectionId: body.data.sectionId },
          orderBy: { position: 'desc' },
          select: { position: true },
        })
      : null;
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.coopClass.update({
        where: { id: classId },
        data: {
          ...(body.data.name !== undefined ? { name: body.data.name } : {}),
          ...(body.data.description !== undefined
            ? { description: body.data.description || null }
            : {}),
          ...(body.data.teacher !== undefined ? { teacher: body.data.teacher || null } : {}),
          ...(body.data.room !== undefined ? { room: body.data.room || null } : {}),
          ...(body.data.time !== undefined ? { time: body.data.time || null } : {}),
          ...(body.data.capacity !== undefined ? { capacity: body.data.capacity } : {}),
          ...(body.data.feeCents !== undefined ? { feeCents: body.data.feeCents } : {}),
          ...(body.data.materials !== undefined ? { materials: body.data.materials || null } : {}),
          ...(moving
            ? { sectionId: body.data.sectionId, position: (last?.position ?? -1) + 1 }
            : {}),
        },
      });
      // A class that changes sections drops the per-child changes tied to the old one.
      if (moving) await tx.coopClassException.deleteMany({ where: { classId } });
      return saved;
    });
    return NextResponse.json(CoopClassList.shape.items.element.parse(updated));
  } catch {
    return serverError();
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, classId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const result = await prisma.coopClass.deleteMany({ where: { id: classId, coopId } });
  if (!result.count) return notFound('Class');
  return NextResponse.json(DeletedRecord.parse({ id: classId }));
}
