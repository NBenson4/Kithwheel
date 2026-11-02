// Scoped class library for the selected co-op.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopCoordinator, requireCoopEditor } from '@/lib/business/coordinator-auth';
import { CoopClassCreate, CoopClassList } from '@/lib/contracts/coops';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

type RouteContext = { params: Promise<{ coopId: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;

  const items = await prisma.coopClass.findMany({ where: { coopId }, orderBy: { name: 'asc' } });
  return NextResponse.json(CoopClassList.parse({ items }));
}

export async function POST(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { coopId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;

  try {
    const parsed = CoopClassCreate.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    const created = await prisma.coopClass.create({
      data: {
        coopId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        teacher: parsed.data.teacher || null,
        room: parsed.data.room || null,
        time: parsed.data.time || null,
      },
    });
    return NextResponse.json(CoopClassList.shape.items.element.parse(created), { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
