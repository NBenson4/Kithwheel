// A family drops a class (or leaves its waitlist). The seat goes to the next family waiting.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyHome } from '@/lib/business/coop-views';
import { fillOpenSeats, notifyPromotions } from '@/lib/business/families';
import { familyByToken, linkNotFound } from '@/lib/business/public-access';
import { guardOrigin, notFound, serverError } from '@/lib/business/route-helpers';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ token: string; enrollmentId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { token, enrollmentId } = await context.params;
  const family = await familyByToken(token);
  if (!family) return linkNotFound();
  try {
    const promotions = await prisma.$transaction(async (tx) => {
      const entry = await tx.coopEnrollment.findFirst({
        where: { id: enrollmentId, child: { familyId: family.id } },
      });
      if (!entry) return null;
      await tx.coopEnrollment.delete({ where: { id: entry.id } });
      return entry.status === 'ENROLLED' ? fillOpenSeats(tx, [entry.classId]) : [];
    });
    if (promotions === null) return notFound('Class');
    await notifyPromotions(promotions);
    return NextResponse.json(await readFamilyHome(token));
  } catch {
    return serverError();
  }
}
