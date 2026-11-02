// Rename a child or change their age group, or remove them (their seats go to the waitlist).
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { fillOpenSeats, notifyPromotions } from '@/lib/business/families';
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
  // Only the child's details change; their classes are changed on the placement screen.
  const result = await prisma.coopChild.updateMany({
    where: { id: childId, coopId },
    data: {
      ...(body.data.name !== undefined ? { name: body.data.name } : {}),
      ...(body.data.ageGroup !== undefined ? { ageGroup: body.data.ageGroup || null } : {}),
    },
  });
  if (!result.count) return notFound('Child');
  return NextResponse.json(await readFamilyOverview(coopId));
}

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, childId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const child = await prisma.coopChild.findFirst({
    where: { id: childId, coopId },
    include: { enrollments: true },
  });
  if (!child) return notFound('Child');
  try {
    const promotions = await prisma.$transaction(async (tx) => {
      await tx.coopChild.delete({ where: { id: childId } });
      return fillOpenSeats(
        tx,
        child.enrollments
          .filter((entry) => entry.status === 'ENROLLED')
          .map((entry) => entry.classId),
      );
    });
    await notifyPromotions(promotions);
    return NextResponse.json(await readFamilyOverview(coopId));
  } catch {
    return serverError();
  }
}
