// The check-in tablet: today's children, and parents tapping to check in or out.
import 'server-only';
import { NextResponse } from 'next/server';
import { markAttendance, readKioskDay, todayIn } from '@/lib/business/attendance';
import { coopIsActive, PAUSED_MESSAGE } from '@/lib/business/families';
import { linkNotFound, noStore } from '@/lib/business/public-access';
import { allow, clientKey } from '@/lib/business/rate-limit';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { plausibleToken } from '@/lib/business/tokens';
import { KioskMark } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ token: string }> };

export const dynamic = 'force-dynamic';

async function coopByKioskToken(token: string) {
  if (!plausibleToken(token)) return null;
  return prisma.coop.findUnique({
    where: { kioskToken: token },
    select: { id: true, name: true, timeZone: true },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const coop = await coopByKioskToken(token);
  if (!coop) return linkNotFound();
  return NextResponse.json(await readKioskDay(coop), { headers: noStore });
}

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { token } = await context.params;
  const coop = await coopByKioskToken(token);
  if (!coop) return linkNotFound();
  if (!allow(clientKey(request, `kiosk:${coop.id}`), 600, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many taps. Wait a minute.' }, { status: 429 });
  }
  if (!(await coopIsActive(coop.id))) {
    return NextResponse.json({ error: PAUSED_MESSAGE }, { status: 402 });
  }
  const body = await readBody(request, KioskMark);
  if (!body.ok) return body.response;
  try {
    const marked = await markAttendance(
      coop.id,
      body.data.childId,
      todayIn(coop.timeZone),
      body.data.action,
      'kiosk',
    );
    if (!marked) return notFound('Child');
    return NextResponse.json(await readKioskDay(coop), { headers: noStore });
  } catch {
    return serverError();
  }
}
