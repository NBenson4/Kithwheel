// Rename, approve (or return to draft), reorder, or remove a section.
import 'server-only';
import { NextResponse } from 'next/server';
import { readSections } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { SectionUpdate } from '@/lib/contracts/coops';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; sectionId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, sectionId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, SectionUpdate);
  if (!body.ok) return body.response;
  const section = await prisma.coopSection.findFirst({
    where: { id: sectionId, coopId },
    include: { _count: { select: { classes: true } } },
  });
  if (!section) return notFound('Section');

  try {
    if (body.data.status === 'approved' && section._count.classes === 0) {
      return NextResponse.json(
        { error: 'Add at least one class before approving this schedule.' },
        { status: 409 },
      );
    }
    await prisma.$transaction(async (tx) => {
      if (body.data.move) {
        // Swap places with the neighbouring section, then renumber everyone in order.
        const all = await tx.coopSection.findMany({
          where: { coopId },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: { id: true },
        });
        const index = all.findIndex((item) => item.id === sectionId);
        const target = index + body.data.move;
        if (target >= 0 && target < all.length) {
          const order = all.map((item) => item.id);
          [order[index], order[target]] = [order[target] as string, order[index] as string];
          for (const [position, id] of order.entries()) {
            await tx.coopSection.update({ where: { id }, data: { position } });
          }
        }
      }
      await tx.coopSection.update({
        where: { id: sectionId },
        data: {
          ...(body.data.name !== undefined ? { name: body.data.name } : {}),
          ...(body.data.status === 'approved'
            ? { status: 'APPROVED', approvedAt: new Date() }
            : {}),
          ...(body.data.status === 'draft' ? { status: 'DRAFT', approvedAt: null } : {}),
        },
      });
    });
    return NextResponse.json(await readSections(coopId));
  } catch {
    return serverError();
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, sectionId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const section = await prisma.coopSection.findFirst({
    where: { id: sectionId, coopId },
    include: { _count: { select: { classes: true, children: true } } },
  });
  if (!section) return notFound('Section');
  if (section._count.classes || section._count.children) {
    return NextResponse.json(
      {
        error: `Move ${section.name}’s classes and children to another section before removing it.`,
      },
      { status: 409 },
    );
  }
  await prisma.coopSection.delete({ where: { id: sectionId } });
  return NextResponse.json(await readSections(coopId));
}
