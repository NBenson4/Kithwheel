// The selected co-op's plan, trial, and whether coordinators can edit.
import 'server-only';
import { NextResponse } from 'next/server';
import { readBillingStatus } from '@/lib/business/billing-data';
import { requireCoopCoordinator } from '@/lib/business/coordinator-auth';

type RouteContext = { params: Promise<{ coopId: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;

  const status = await readBillingStatus(coopId);
  if (!status) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json(status);
}
