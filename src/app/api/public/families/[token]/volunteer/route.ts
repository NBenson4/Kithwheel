// A family logs volunteer time; a coordinator approves it.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyHome } from '@/lib/business/coop-views';
import { coopIsActive, PAUSED_MESSAGE } from '@/lib/business/families';
import { familyByToken, linkNotFound } from '@/lib/business/public-access';
import { allow, clientKey } from '@/lib/business/rate-limit';
import { dateOnly, guardOrigin, readBody, serverError } from '@/lib/business/route-helpers';
import { VolunteerCreate } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { token } = await context.params;
  const family = await familyByToken(token);
  if (!family) return linkNotFound();
  if (!allow(clientKey(request, `volunteer:${family.id}`), 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many entries. Try again later.' }, { status: 429 });
  }
  if (!(await coopIsActive(family.coopId))) {
    return NextResponse.json({ error: PAUSED_MESSAGE }, { status: 402 });
  }
  const body = await readBody(request, VolunteerCreate);
  if (!body.ok) return body.response;
  try {
    await prisma.coopVolunteerLog.create({
      data: {
        coopId: family.coopId,
        familyId: family.id,
        date: dateOnly(body.data.date),
        minutes: body.data.minutes,
        description: body.data.description,
      },
    });
    return NextResponse.json(await readFamilyHome(token), { status: 201 });
  } catch {
    return serverError();
  }
}
