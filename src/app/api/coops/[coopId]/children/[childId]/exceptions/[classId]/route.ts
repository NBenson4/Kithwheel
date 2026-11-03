// Undo a case-by-case change: the child goes back to their section's schedule for this class.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin } from '@/lib/business/route-helpers';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; childId: string; classId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, childId, classId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  await prisma.coopClassException.deleteMany({ where: { coopId, childId, classId } });
  return NextResponse.json(await readFamilyOverview(coopId));
}
