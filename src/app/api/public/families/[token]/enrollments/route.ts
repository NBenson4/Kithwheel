// A family adds a class for one of their children while registration is open.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyHome } from '@/lib/business/coop-views';
import {
  coopIsActive,
  PAUSED_MESSAGE,
  placeChild,
  registrableClassIds,
} from '@/lib/business/families';
import { familyByToken, linkNotFound } from '@/lib/business/public-access';
import { guardOrigin, notFound, readBody, serverError } from '@/lib/business/route-helpers';
import { EnrollmentAdd } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { token } = await context.params;
  const family = await familyByToken(token);
  if (!family) return linkNotFound();
  if (!family.coop.registrationOpen) {
    return NextResponse.json(
      { error: 'Registration is closed. Ask your coordinator about class changes.' },
      { status: 409 },
    );
  }
  if (!(await coopIsActive(family.coopId))) {
    return NextResponse.json({ error: PAUSED_MESSAGE }, { status: 402 });
  }
  const body = await readBody(request, EnrollmentAdd);
  if (!body.ok) return body.response;
  const child = await prisma.coopChild.findFirst({
    where: { id: body.data.childId, familyId: family.id },
  });
  if (!child) return notFound('Child');
  if (!(await registrableClassIds(family.coopId)).has(body.data.classId)) {
    return NextResponse.json({ error: 'That class isn’t offered right now.' }, { status: 400 });
  }
  try {
    await prisma.$transaction((tx) => placeChild(tx, family.coopId, child.id, body.data.classId));
    return NextResponse.json(await readFamilyHome(token), { status: 201 });
  } catch {
    return serverError();
  }
}
