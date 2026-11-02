// Families, class rosters and waitlists for a co-op; coordinators can also add a family.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopCoordinator, requireCoopEditor } from '@/lib/business/coordinator-auth';
import { registerFamily, sendFamilyWelcome } from '@/lib/business/families';
import { guardOrigin, readBody, serverError } from '@/lib/business/route-helpers';
import { FamilyCreate } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;
  return NextResponse.json(await readFamilyOverview(coopId));
}

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, FamilyCreate);
  if (!body.ok) return body.response;

  try {
    const outcome = await registerFamily(coopId, body.data, { source: 'coordinator' });
    if (outcome.status === 'already_registered') {
      return NextResponse.json(
        { error: `A family with ${body.data.email} is already registered.` },
        { status: 409 },
      );
    }
    if (outcome.status === 'invalid') {
      return NextResponse.json({ error: outcome.message }, { status: 400 });
    }
    if (body.data.sendEmail) {
      const coop = await prisma.coop.findUniqueOrThrow({
        where: { id: coopId },
        select: { name: true },
      });
      await sendFamilyWelcome(coop.name, body.data, outcome, access.email).catch(() => undefined);
    }
    return NextResponse.json(await readFamilyOverview(coopId), { status: 201 });
  } catch {
    return serverError();
  }
}
