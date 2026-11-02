// Remove a charge or discount.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin } from '@/lib/business/route-helpers';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; chargeId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, chargeId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  await prisma.coopFamilyCharge.deleteMany({ where: { id: chargeId, coopId } });
  return NextResponse.json(await readFamilyOverview(coopId));
}
