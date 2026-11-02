// Record a payment a family made outside Kithwheel (cash, check, Venmo...).
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyOverview } from '@/lib/business/coop-views';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import {
  dateOnly,
  guardOrigin,
  notFound,
  readBody,
  serverError,
} from '@/lib/business/route-helpers';
import { PaymentCreate } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string; familyId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId, familyId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  const body = await readBody(request, PaymentCreate);
  if (!body.ok) return body.response;
  const family = await prisma.coopFamily.findFirst({ where: { id: familyId, coopId } });
  if (!family) return notFound('Family');
  try {
    await prisma.coopFamilyPayment.create({
      data: {
        coopId,
        familyId,
        amountCents: body.data.amountCents,
        method: body.data.method,
        note: body.data.note || null,
        paidOn: dateOnly(body.data.paidOn),
      },
    });
    return NextResponse.json(await readFamilyOverview(coopId), { status: 201 });
  } catch {
    return serverError();
  }
}
