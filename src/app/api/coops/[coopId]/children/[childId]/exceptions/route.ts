// A case-by-case change to one child's schedule: skip one of their section's classes, or
// take a single class from another section.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { ClassExceptionSet } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; childId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, childId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, ClassExceptionSet);
  if (!body.ok) return body.response;
  const [child, item] = await Promise.all([
    prisma.coopChild.findFirst({ where: { id: childId, coopId } }),
    prisma.coopClass.findFirst({ where: { id: body.data.classId, coopId } }),
  ]);
  if (!child) return notFound('Child');
  if (!item) return notFound('Class');
  const ownClass = child.sectionId !== null && item.sectionId === child.sectionId;
  if (body.data.kind === 'skip' && !ownClass) {
    return NextResponse.json(
      { error: 'Only classes in the child’s own section can be skipped.' },
      { status: 400 },
    );
  }
  if (body.data.kind === 'add' && ownClass) {
    return NextResponse.json(
      { error: 'That class is already on this child’s section schedule.' },
      { status: 400 },
    );
  }
  try {
    const kind = body.data.kind === 'add' ? 'ADD' : 'SKIP';
    await prisma.coopClassException.upsert({
      where: { childId_classId: { childId, classId: item.id } },
      create: { coopId, childId, classId: item.id, kind },
      update: { kind },
    });
    return NextResponse.json(await readFamilyOverview(coopId), { status: 201 });
  } catch {
    return serverError();
  }
}
