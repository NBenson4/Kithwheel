// Look up and accept a coordinator invitation.
import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { guardOrigin, notFound } from '@/lib/business/route-helpers';
import { hashToken, plausibleToken } from '@/lib/business/tokens';
import { InviteAccepted, InviteInfo } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ token: string }> };

export const dynamic = 'force-dynamic';

async function findInvite(token: string) {
  if (!plausibleToken(token)) return null;
  return prisma.coopInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { coop: { select: { name: true } } },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const invite = await findInvite(token);
  if (!invite) return notFound('Invitation');
  const inviter = await prisma.user.findUnique({
    where: { id: invite.invitedByUserId },
    select: { name: true, email: true },
  });
  return NextResponse.json(
    InviteInfo.parse({
      coopName: invite.coop.name,
      email: invite.email,
      invitedBy: inviter?.name || inviter?.email || 'A coordinator',
      status: invite.acceptedAt ? 'accepted' : invite.expiresAt < new Date() ? 'expired' : 'valid',
    }),
  );
}

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Sign in to accept this invitation.' }, { status: 401 });
  }
  const { token } = await context.params;
  const invite = await findInvite(token);
  if (!invite) return notFound('Invitation');
  if (invite.acceptedAt) {
    if (invite.acceptedByUserId === session.user.id) {
      return NextResponse.json(InviteAccepted.parse({ coopId: invite.coopId }));
    }
    return NextResponse.json({ error: 'This invitation was already used.' }, { status: 409 });
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json(
      { error: 'This invitation has expired. Ask the coordinator to send a new one.' },
      { status: 410 },
    );
  }
  if (session.user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return NextResponse.json(
      {
        error: `This invitation is for ${invite.email}. Sign in with that email to accept it.`,
      },
      { status: 403 },
    );
  }
  if (!session.user.emailVerified) {
    return NextResponse.json(
      { error: 'Verify your email address first, then open this invitation again.' },
      { status: 403 },
    );
  }

  await prisma.$transaction([
    prisma.coopMembership.upsert({
      where: { coopId_userId: { coopId: invite.coopId, userId: session.user.id } },
      create: { coopId: invite.coopId, userId: session.user.id, role: 'coordinator' },
      update: { role: 'coordinator' },
    }),
    prisma.coopInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), acceptedByUserId: session.user.id },
    }),
  ]);
  return NextResponse.json(InviteAccepted.parse({ coopId: invite.coopId }));
}
