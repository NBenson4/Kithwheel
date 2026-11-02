// Email a family the link to their family page again.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopCoordinator } from '@/lib/business/coordinator-auth';
import { familyUrl } from '@/lib/business/families';
import { guardOrigin, notFound, serverError } from '@/lib/business/route-helpers';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { familyLinkEmail } from '@/lib/email/templates';

type RouteContext = { params: Promise<{ coopId: string; familyId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, familyId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;
  const family = await prisma.coopFamily.findFirst({
    where: { id: familyId, coopId },
    include: { coop: { select: { name: true } } },
  });
  if (!family) return notFound('Family');
  try {
    await sendEmail({
      to: family.email,
      replyTo: access.email,
      ...familyLinkEmail({
        coopName: family.coop.name,
        parentName: family.parentName,
        url: familyUrl(family.accessToken),
      }),
    });
    return NextResponse.json({ sent: true });
  } catch {
    return serverError();
  }
}
