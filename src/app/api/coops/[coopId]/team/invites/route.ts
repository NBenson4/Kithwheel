// Invite another coordinator by email.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin, readBody, serverError } from '@/lib/business/route-helpers';
import { INVITE_DAYS, readTeam } from '@/lib/business/team';
import { hashToken, newToken } from '@/lib/business/tokens';
import { InviteCreate } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { coordinatorInviteEmail } from '@/lib/email/templates';
import { siteUrl } from '@/lib/site';

type RouteContext = { params: Promise<{ coopId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, InviteCreate);
  if (!body.ok) return body.response;
  const { email } = body.data;

  try {
    const coop = await prisma.coop.findUniqueOrThrow({
      where: { id: coopId },
      select: { name: true },
    });
    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existingUser) {
      const member = await prisma.coopMembership.findFirst({
        where: { coopId, userId: existingUser.id },
        select: { id: true },
      });
      if (member) {
        return NextResponse.json(
          { error: `${email} already coordinates this co-op.` },
          { status: 409 },
        );
      }
    }
    const pending = await prisma.coopInvite.count({
      where: { coopId, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (pending >= 20) {
      return NextResponse.json(
        { error: 'This co-op has 20 open invitations. Cancel some before sending more.' },
        { status: 429 },
      );
    }

    // A fresh invite replaces any open one for the same address.
    await prisma.coopInvite.deleteMany({ where: { coopId, email, acceptedAt: null } });
    const token = newToken();
    await prisma.coopInvite.create({
      data: {
        coopId,
        email,
        tokenHash: hashToken(token),
        invitedByUserId: access.userId,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    await sendEmail({
      to: email,
      replyTo: access.email,
      ...coordinatorInviteEmail({
        coopName: coop.name,
        invitedBy: access.name || access.email,
        url: `${siteUrl}/invite/${token}`,
      }),
    });
    return NextResponse.json(await readTeam(coopId, access.userId), { status: 201 });
  } catch {
    return serverError();
  }
}
