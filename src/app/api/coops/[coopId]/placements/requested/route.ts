// Put every child who isn't in a section yet into the section matching the grade their
// family gave at sign-up. Children already in a section are left alone.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { moveChildToSection } from '@/lib/business/placements';
import { guardOrigin, serverError } from '@/lib/business/route-helpers';
import { AssignResult } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string }> };

const key = (value: string) => value.trim().toLowerCase();

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  try {
    const [sections, children] = await Promise.all([
      prisma.coopSection.findMany({ where: { coopId }, select: { id: true, name: true } }),
      prisma.coopChild.findMany({
        where: { coopId, sectionId: null, requestedSection: { not: null } },
        select: { id: true, requestedSection: true },
      }),
    ]);
    const byName = new Map(sections.map((section) => [key(section.name), section.id]));
    let assigned = 0;
    await prisma.$transaction(async (tx) => {
      for (const child of children) {
        const sectionId = byName.get(key(child.requestedSection ?? ''));
        if (!sectionId) continue;
        await moveChildToSection(tx, child.id, sectionId);
        assigned += 1;
      }
    });
    return NextResponse.json(AssignResult.parse({ assigned }));
  } catch {
    return serverError();
  }
}
