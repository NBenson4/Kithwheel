// Co-op settings: registration, calendar, fees, and volunteer requirement.
import 'server-only';
import { NextResponse } from 'next/server';
import { readSettings } from '@/lib/business/coop-views';
import { requireCoopCoordinator, requireCoopEditor } from '@/lib/business/coordinator-auth';
import { dateOnly, guardOrigin, readBody, serverError } from '@/lib/business/route-helpers';
import { CoopSettingsUpdate } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;
  return NextResponse.json(await readSettings(coopId));
}

export async function PATCH(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, CoopSettingsUpdate);
  if (!body.ok) return body.response;

  try {
    const { termStart, termEnd, registrationNote, paymentInstructions, ...rest } = body.data;
    await prisma.coop.update({
      where: { id: coopId },
      data: {
        ...rest,
        ...(termStart !== undefined ? { termStart: termStart ? dateOnly(termStart) : null } : {}),
        ...(termEnd !== undefined ? { termEnd: termEnd ? dateOnly(termEnd) : null } : {}),
        ...(registrationNote !== undefined ? { registrationNote: registrationNote || null } : {}),
        ...(paymentInstructions !== undefined
          ? { paymentInstructions: paymentInstructions || null }
          : {}),
      },
    });
    return NextResponse.json(await readSettings(coopId));
  } catch {
    return serverError();
  }
}
