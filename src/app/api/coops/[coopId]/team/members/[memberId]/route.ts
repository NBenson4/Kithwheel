// Remove a coordinator, or leave the co-op yourself. The co-op's creator stays.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopCoordinator } from '@/lib/business/coordinator-auth';
import { guardOrigin, notFound } from '@/lib/business/route-helpers';
import { readTeam } from '@/lib/business/team';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; memberId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, memberId } = await context.params;
  // Leaving or removing someone is allowed even when the plan has lapsed.
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;

  const membership = await prisma.coopMembership.findFirst({
    where: { id: memberId, coopId },
    include: { coop: { select: { createdByUserId: true } } },
  });
  if (!membership) return notFound('Coordinator');
  if (membership.userId === membership.coop.createdByUserId) {
    return NextResponse.json(
      { error: 'The coordinator who created the co-op can’t be removed.' },
      { status: 409 },
    );
  }
  await prisma.coopMembership.delete({ where: { id: membership.id } });
  if (membership.userId === access.userId) {
    return NextResponse.json({ members: [], invites: [] });
  }
  return NextResponse.json(await readTeam(coopId, access.userId));
}
