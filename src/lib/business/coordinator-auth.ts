// The co-op boundary used by every coordinator API route.
import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

type CoordinatorAccess = { ok: true; userId: string } | { ok: false; response: NextResponse };

export async function requireCoopCoordinator(coopId: string): Promise<CoordinatorAccess> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }

  const coop = await prisma.coop.findFirst({
    where: { id: coopId, createdByUserId: session.user.id },
    select: { id: true },
  });
  if (!coop) {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }

  const membership = await prisma.coopMembership.findFirst({
    where: { coopId, userId: session.user.id, role: 'coordinator' },
    select: { id: true },
  });
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }

  return { ok: true, userId: session.user.id };
}
