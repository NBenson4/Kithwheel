// Approve or decline logged volunteer time, or delete an entry.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin, notFound, readBody } from '@/lib/business/route-helpers';
import { VolunteerReview } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; logId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, logId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, VolunteerReview);
  if (!body.ok) return body.response;
  const status = body.data.status.toUpperCase() as 'PENDING' | 'APPROVED' | 'DECLINED';
  const result = await prisma.coopVolunteerLog.updateMany({
    where: { id: logId, coopId },
    data: { status, reviewedAt: status === 'PENDING' ? null : new Date() },
  });
  if (!result.count) return notFound('Volunteer entry');
  return NextResponse.json(await readFamilyOverview(coopId));
}

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, logId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  await prisma.coopVolunteerLog.deleteMany({ where: { id: logId, coopId } });
  return NextResponse.json(await readFamilyOverview(coopId));
}
