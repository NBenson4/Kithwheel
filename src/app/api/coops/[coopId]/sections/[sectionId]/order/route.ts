// Put a section's classes in order (the order families see in the schedule).
import 'server-only';
import { NextResponse } from 'next/server';
import { readSections } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { ClassOrder } from '@/lib/contracts/coops';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; sectionId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, sectionId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, ClassOrder);
  if (!body.ok) return body.response;
  const classes = await prisma.coopClass.findMany({
    where: { coopId, sectionId },
    select: { id: true },
  });
  if (!classes.length && body.data.classIds.length) return notFound('Section');
  const ids = new Set(classes.map((item) => item.id));
  if (body.data.classIds.length !== ids.size || body.data.classIds.some((id) => !ids.has(id))) {
    return NextResponse.json(
      { error: 'The class list changed. Refresh and try again.' },
      { status: 409 },
    );
  }
  try {
    await prisma.$transaction(
      body.data.classIds.map((id, position) =>
        prisma.coopClass.update({ where: { id }, data: { position } }),
      ),
    );
    return NextResponse.json(await readSections(coopId));
  } catch {
    return serverError();
  }
}
