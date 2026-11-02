// Attendance totals by day and by child.
import 'server-only';
import { NextResponse } from 'next/server';
import { readAttendanceHistory } from '@/lib/business/attendance';
import { requireCoopCoordinator } from '@/lib/business/coordinator-auth';

type RouteContext = { params: Promise<{ coopId: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { coopId } = await context.params;
  const access = await requireCoopCoordinator(coopId);
  if (!access.ok) return access.response;
  return NextResponse.json(await readAttendanceHistory(coopId));
}
