// Set exactly which children are in a section. Ticked children move into it (and follow its
// whole schedule); children who were unticked leave it and wait to be placed again.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { moveChildToSection } from '@/lib/business/placements';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { SectionMembers } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; sectionId: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, sectionId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, SectionMembers);
  if (!body.ok) return body.response;
  const selected = new Set(body.data.childIds);
  const section = await prisma.coopSection.findFirst({ where: { id: sectionId, coopId } });
  if (!section) return notFound('Section');
  const children = await prisma.coopChild.findMany({
    where: { coopId, OR: [{ id: { in: [...selected] } }, { sectionId }] },
    select: { id: true, sectionId: true },
  });
  if (children.filter((child) => selected.has(child.id)).length !== selected.size) {
    return NextResponse.json(
      { error: 'One of those children isn’t in this co-op.' },
      { status: 400 },
    );
  }
  try {
    await prisma.$transaction(async (tx) => {
      for (const child of children) {
        const shouldBeIn = selected.has(child.id);
        if (shouldBeIn && child.sectionId !== sectionId) {
          await moveChildToSection(tx, child.id, sectionId);
        } else if (!shouldBeIn && child.sectionId === sectionId) {
          await moveChildToSection(tx, child.id, null);
        }
      }
    });
    return NextResponse.json(await readFamilyOverview(coopId));
  } catch {
    return serverError();
  }
}
