// Move a child off the waitlist (even past capacity), or drop them from a class.
import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { fillOpenSeats, notifyPromotions } from '@/lib/business/families';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; enrollmentId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, enrollmentId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, z.object({ status: z.literal('enrolled') }));
  if (!body.ok) return body.response;
  const result = await prisma.coopEnrollment.updateMany({
    where: { id: enrollmentId, coopId, status: 'WAITLISTED' },
    data: { status: 'ENROLLED', promotedAt: new Date() },
  });
  if (!result.count) return notFound('Waitlist entry');
  return NextResponse.json(await readFamilyOverview(coopId));
}

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, enrollmentId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  try {
    const promotions = await prisma.$transaction(async (tx) => {
      const entry = await tx.coopEnrollment.findFirst({ where: { id: enrollmentId, coopId } });
      if (!entry) return null;
      await tx.coopEnrollment.delete({ where: { id: entry.id } });
      return entry.status === 'ENROLLED' ? fillOpenSeats(tx, [entry.classId]) : [];
    });
    if (promotions === null) return notFound('Enrollment');
    await notifyPromotions(promotions);
    return NextResponse.json(await readFamilyOverview(coopId));
  } catch {
    return serverError();
  }
}
