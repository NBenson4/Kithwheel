// Grade sections and their class schedules; coordinators can add a section.
import 'server-only';
import { NextResponse } from 'next/server';
import { readSections } from '@/lib/business/coop-views';
import { requireCoopCoordinator, requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin, readBody, serverError } from '@/lib/business/route-helpers';
import { SectionCreate } from '@/lib/contracts/coops';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;
  return NextResponse.json(await readSections(coopId));
}

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, SectionCreate);
  if (!body.ok) return body.response;
  try {
    const count = await prisma.coopSection.count({ where: { coopId } });
    if (count >= 40) {
      return NextResponse.json({ error: 'A co-op can have up to 40 sections.' }, { status: 409 });
    }
    const last = await prisma.coopSection.findFirst({
      where: { coopId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    await prisma.coopSection.create({
      data: { coopId, name: body.data.name, position: (last?.position ?? -1) + 1 },
    });
    return NextResponse.json(await readSections(coopId), { status: 201 });
  } catch {
    return serverError();
  }
}
