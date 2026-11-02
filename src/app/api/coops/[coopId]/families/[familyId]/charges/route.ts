// Add a one-off charge or discount to a family's balance.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { ChargeCreate } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; familyId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, familyId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, ChargeCreate);
  if (!body.ok) return body.response;
  const family = await prisma.coopFamily.findFirst({ where: { id: familyId, coopId } });
  if (!family) return notFound('Family');
  try {
    await prisma.coopFamilyCharge.create({ data: { coopId, familyId, ...body.data } });
    return NextResponse.json(await readFamilyOverview(coopId), { status: 201 });
  } catch {
    return serverError();
  }
}
