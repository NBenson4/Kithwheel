// Set exactly who is enrolled in one class: the placement screen's "save".
// Selected children are enrolled (a coordinator may go past capacity); enrolled children
// who were unselected are removed. Waitlisted children who weren't selected stay waiting.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { RosterSet } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; classId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, classId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, RosterSet);
  if (!body.ok) return body.response;
  const selected = new Set(body.data.childIds);

  const item = await prisma.coopClass.findFirst({ where: { id: classId, coopId } });
  if (!item) return notFound('Class');
  const children = await prisma.coopChild.count({ where: { coopId, id: { in: [...selected] } } });
  if (children !== selected.size) {
    return NextResponse.json(
      { error: 'One of those children isn’t in this co-op.' },
      { status: 400 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CoopClass" WHERE id = ${classId} FOR UPDATE`;
      const existing = await tx.coopEnrollment.findMany({ where: { classId } });
      const byChild = new Map(existing.map((entry) => [entry.childId, entry]));
      const removed = existing
        .filter((entry) => entry.status === 'ENROLLED' && !selected.has(entry.childId))
        .map((entry) => entry.id);
      if (removed.length) await tx.coopEnrollment.deleteMany({ where: { id: { in: removed } } });
      const toCreate = [...selected].filter((childId) => !byChild.has(childId));
      if (toCreate.length) {
        await tx.coopEnrollment.createMany({
          data: toCreate.map((childId) => ({
            coopId,
            classId,
            childId,
            status: 'ENROLLED' as const,
          })),
        });
      }
      const promoted = existing
        .filter((entry) => entry.status === 'WAITLISTED' && selected.has(entry.childId))
        .map((entry) => entry.id);
      if (promoted.length) {
        await tx.coopEnrollment.updateMany({
          where: { id: { in: promoted } },
          data: { status: 'ENROLLED', promotedAt: new Date() },
        });
      }
    });
    return NextResponse.json(await readFamilyOverview(coopId));
  } catch {
    return serverError();
  }
}
