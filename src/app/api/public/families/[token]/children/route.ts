// A family adds another child while registration is open. Coordinators place children in
// classes; when the co-op places by age group, the child joins their age group's classes.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyHome } from '@/lib/business/coop-views';
import {
  autoPlacementFor,
  coopIsActive,
  PAUSED_MESSAGE,
  placeChild,
} from '@/lib/business/families';
import { familyByToken, linkNotFound } from '@/lib/business/public-access';
import { guardOrigin, readBody, serverError } from '@/lib/business/route-helpers';
import { ChildInput } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { token } = await context.params;
  const family = await familyByToken(token);
  if (!family) return linkNotFound();
  if (!family.coop.registrationOpen) {
    return NextResponse.json({ error: 'Registration is closed right now.' }, { status: 409 });
  }
  if (!(await coopIsActive(family.coopId))) {
    return NextResponse.json({ error: PAUSED_MESSAGE }, { status: 402 });
  }
  const body = await readBody(request, ChildInput);
  if (!body.ok) return body.response;
  const count = await prisma.coopChild.count({ where: { familyId: family.id } });
  if (count >= 12) {
    return NextResponse.json({ error: 'A family can have up to 12 children.' }, { status: 409 });
  }
  try {
    const byAgeGroup = await autoPlacementFor(family.coopId);
    await prisma.$transaction(async (tx) => {
      const child = await tx.coopChild.create({
        data: {
          coopId: family.coopId,
          familyId: family.id,
          name: body.data.name,
          ageGroup: body.data.ageGroup || null,
        },
      });
      for (const classId of byAgeGroup(child.ageGroup)) {
        await placeChild(tx, family.coopId, child.id, classId);
      }
    });
    return NextResponse.json(await readFamilyHome(token), { status: 201 });
  } catch {
    return serverError();
  }
}
