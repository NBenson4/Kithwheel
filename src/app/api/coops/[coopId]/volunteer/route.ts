// Coordinator records volunteer time for a family (approved straight away).
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import {
  dateOnly,
  guardOrigin,
  notFound,
  readBody,
  serverError,
} from '@/lib/business/route-helpers';
import { CoordinatorVolunteerCreate } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, CoordinatorVolunteerCreate);
  if (!body.ok) return body.response;
  const family = await prisma.coopFamily.findFirst({ where: { id: body.data.familyId, coopId } });
  if (!family) return notFound('Family');
  try {
    await prisma.coopVolunteerLog.create({
      data: {
        coopId,
        familyId: family.id,
        date: dateOnly(body.data.date),
        minutes: body.data.minutes,
        description: body.data.description,
        status: 'APPROVED',
        addedByCoordinator: true,
        reviewedAt: new Date(),
      },
    });
    return NextResponse.json(await readFamilyOverview(coopId), { status: 201 });
  } catch {
    return serverError();
  }
}
