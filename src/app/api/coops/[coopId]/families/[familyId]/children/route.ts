// Coordinator adds a child to an existing family, optionally straight into a section.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { ChildInput } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; familyId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, familyId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, ChildInput);
  if (!body.ok) return body.response;
  const family = await prisma.coopFamily.findFirst({
    where: { id: familyId, coopId },
    select: { id: true, _count: { select: { children: true } } },
  });
  if (!family) return notFound('Family');
  if (family._count.children >= 12) {
    return NextResponse.json({ error: 'A family can have up to 12 children.' }, { status: 409 });
  }
  if (body.data.sectionId) {
    const section = await prisma.coopSection.findFirst({
      where: { id: body.data.sectionId, coopId },
    });
    if (!section) return notFound('Section');
  }
  try {
    await prisma.coopChild.create({
      data: {
        coopId,
        familyId,
        name: body.data.name,
        requestedSection: body.data.grade || null,
        sectionId: body.data.sectionId || null,
      },
    });
    return NextResponse.json(await readFamilyOverview(coopId), { status: 201 });
  } catch {
    return serverError();
  }
}
