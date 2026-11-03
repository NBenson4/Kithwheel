// A co-op's classes, and adding a class to one of its sections.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopCoordinator, requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { CoopClassCreate, CoopClassList } from '@/lib/contracts/coops';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;
  const items = await prisma.coopClass.findMany({
    where: { coopId },
    orderBy: [{ section: { position: 'asc' } }, { position: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json(CoopClassList.parse({ items }));
}

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, CoopClassCreate);
  if (!body.ok) return body.response;
  const section = await prisma.coopSection.findFirst({
    where: { id: body.data.sectionId, coopId },
  });
  if (!section) return notFound('Section');
  try {
    const last = await prisma.coopClass.findFirst({
      where: { sectionId: section.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const created = await prisma.coopClass.create({
      data: {
        coopId,
        sectionId: section.id,
        position: (last?.position ?? -1) + 1,
        name: body.data.name,
        description: body.data.description || null,
        teacher: body.data.teacher || null,
        room: body.data.room || null,
        time: body.data.time || null,
        capacity: body.data.capacity ?? null,
        feeCents: body.data.feeCents ?? 0,
        materials: body.data.materials || null,
      },
    });
    return NextResponse.json(CoopClassList.shape.items.element.parse(created), { status: 201 });
  } catch {
    return serverError();
  }
}
