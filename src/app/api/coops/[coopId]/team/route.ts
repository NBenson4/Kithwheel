// The co-op's coordinators and pending invitations.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopCoordinator } from '@/lib/business/coordinator-auth';
import { readTeam } from '@/lib/business/team';

type RouteContext = { params: Promise<{ coopId: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;
  return NextResponse.json(await readTeam(coopId, access.userId));
}
