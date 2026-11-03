// Rename a child, move them to another section, or remove them.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { moveChildToSection } from '@/lib/business/placements';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { ChildUpdate } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; childId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, childId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, ChildUpdate);
  if (!body.ok) return body.response;
  const child = await prisma.coopChild.findFirst({ where: { id: childId, coopId } });
  if (!child) return notFound('Child');
  if (body.data.sectionId) {
    const section = await prisma.coopSection.findFirst({
      where: { id: body.data.sectionId, coopId },
    });
    if (!section) return notFound('Section');
  }
  try {
    await prisma.$transaction(async (tx) => {
      if (body.data.name !== undefined) {
        await tx.coopChild.update({ where: { id: childId }, data: { name: body.data.name } });
      }
      if (body.data.sectionId !== undefined && body.data.sectionId !== child.sectionId) {
        await moveChildToSection(tx, childId, body.data.sectionId);
      }
    });
    return NextResponse.json(await readFamilyOverview(coopId));
  } catch {
    return serverError();
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, childId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const result = await prisma.coopChild.deleteMany({ where: { id: childId, coopId } });
  if (!result.count) return notFound('Child');
  return NextResponse.json(await readFamilyOverview(coopId));
}
