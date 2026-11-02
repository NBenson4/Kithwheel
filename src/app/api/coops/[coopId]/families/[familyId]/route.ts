// Edit or remove one family. Removing a family frees its seats for the waitlist.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { fillOpenSeats, notifyPromotions } from '@/lib/business/families';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { FamilyUpdate } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; familyId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, familyId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, FamilyUpdate);
  if (!body.ok) return body.response;
  try {
    const result = await prisma.coopFamily.updateMany({
      where: { id: familyId, coopId },
      data: {
        ...body.data,
        ...(body.data.phone !== undefined ? { phone: body.data.phone || null } : {}),
        ...(body.data.notes !== undefined ? { notes: body.data.notes || null } : {}),
      },
    });
    if (!result.count) return notFound('Family');
    return NextResponse.json(await readFamilyOverview(coopId));
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'Another family already uses that email.' },
        { status: 409 },
      );
    }
    return serverError();
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, familyId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  try {
    const family = await prisma.coopFamily.findFirst({
      where: { id: familyId, coopId },
      select: { children: { select: { enrollments: { select: { classId: true } } } } },
    });
    if (!family) return notFound('Family');
    const classIds = family.children.flatMap((child) =>
      child.enrollments.map((entry) => entry.classId),
    );
    const promotions = await prisma.$transaction(async (tx) => {
      await tx.coopFamily.delete({ where: { id: familyId } });
      return fillOpenSeats(tx, classIds);
    });
    await notifyPromotions(promotions);
    return NextResponse.json(await readFamilyOverview(coopId));
  } catch {
    return serverError();
  }
}
