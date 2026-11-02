// Coordinator adds a child to a class (or its waitlist when full).
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { placeChild } from '@/lib/business/families';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { EnrollmentAdd } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, EnrollmentAdd);
  if (!body.ok) return body.response;
  const child = await prisma.coopChild.findFirst({ where: { id: body.data.childId, coopId } });
  if (!child) return notFound('Child');
  try {
    const placed = await prisma.$transaction((tx) =>
      placeChild(tx, coopId, child.id, body.data.classId),
    );
    if (!placed) return notFound('Class');
    return NextResponse.json(await readFamilyOverview(coopId), { status: 201 });
  } catch {
    return serverError();
  }
}
