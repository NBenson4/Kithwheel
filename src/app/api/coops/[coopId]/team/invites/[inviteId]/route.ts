// Cancel a pending invitation.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin } from '@/lib/business/route-helpers';
import { readTeam } from '@/lib/business/team';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; inviteId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, inviteId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  await prisma.coopInvite.deleteMany({ where: { id: inviteId, coopId, acceptedAt: null } });
  return NextResponse.json(await readTeam(coopId, access.userId));
}
