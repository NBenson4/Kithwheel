// Rename a child or change their age group (optionally moving their classes), or remove them.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import {
  ageGroupKey,
  classesByAgeGroup,
  fillOpenSeats,
  notifyPromotions,
  placeChild,
} from '@/lib/business/families';
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
  const { movePlacements, ...data } = body.data;
  const changingGroup =
    data.ageGroup !== undefined && ageGroupKey(data.ageGroup) !== ageGroupKey(child.ageGroup);

  try {
    const groups = changingGroup && movePlacements ? await classesByAgeGroup(coopId) : null;
    const promotions = await prisma.$transaction(async (tx) => {
      await tx.coopChild.update({
        where: { id: childId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.ageGroup !== undefined ? { ageGroup: data.ageGroup || null } : {}),
        },
      });
      if (!groups) return [];
      const oldClasses = new Set(groups.get(ageGroupKey(child.ageGroup)) ?? []);
      const newClasses = groups.get(ageGroupKey(data.ageGroup)) ?? [];
      const leaving = await tx.coopEnrollment.findMany({
        where: {
          childId,
          classId: { in: [...oldClasses].filter((id) => !newClasses.includes(id)) },
        },
      });
      if (leaving.length) {
        await tx.coopEnrollment.deleteMany({
          where: { id: { in: leaving.map((entry) => entry.id) } },
        });
      }
      for (const classId of newClasses) await placeChild(tx, coopId, childId, classId);
      return fillOpenSeats(
        tx,
        leaving.filter((entry) => entry.status === 'ENROLLED').map((entry) => entry.classId),
      );
    });
    await notifyPromotions(promotions);
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
