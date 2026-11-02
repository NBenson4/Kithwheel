// "Place everyone by age group": puts every child into each class of their age group's
// rotation in the current schedule. Children already placed (or waiting) are left alone;
// full classes put the extra children on the waitlist.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { ageGroupKey, classesByAgeGroup, placeChild } from '@/lib/business/families';
import { guardOrigin, serverError } from '@/lib/business/route-helpers';
import { AutoPlaceResult } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  try {
    const groups = await classesByAgeGroup(coopId);
    if (!groups.size) {
      return NextResponse.json(
        { error: 'Publish a schedule first, so each age group has its classes.' },
        { status: 409 },
      );
    }
    const children = await prisma.coopChild.findMany({
      where: { coopId },
      orderBy: { createdAt: 'asc' },
      include: { enrollments: { select: { classId: true } } },
    });
    let placed = 0;
    let waitlisted = 0;
    for (const child of children) {
      const have = new Set(child.enrollments.map((entry) => entry.classId));
      for (const classId of groups.get(ageGroupKey(child.ageGroup)) ?? []) {
        if (have.has(classId)) continue;
        const result = await prisma.$transaction((tx) => placeChild(tx, coopId, child.id, classId));
        if (result?.status === 'ENROLLED') placed += 1;
        else if (result) waitlisted += 1;
      }
    }
    return NextResponse.json(AutoPlaceResult.parse({ placed, waitlisted }));
  } catch {
    return serverError();
  }
}
