// Coordinator-owned schedule list and draft creation.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopCoordinator } from '@/lib/business/coordinator-auth';
import { readScheduleList } from '@/lib/business/schedule-data';
import { ScheduleCreate } from '@/lib/contracts/coops';
import { prisma } from '@/lib/db';
import { sameOrigin } from '@/lib/same-origin';

type RouteContext = { params: Promise<{ coopId: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;
  return NextResponse.json(await readScheduleList(coopId));
}

export async function POST(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;

  try {
    const parsed = ScheduleCreate.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json({ errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    await prisma.coopSchedule.create({ data: { coopId, title: parsed.data.title } });
    return NextResponse.json(await readScheduleList(coopId), { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
