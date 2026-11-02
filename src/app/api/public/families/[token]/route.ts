// A family's private page data.
import 'server-only';
import { NextResponse } from 'next/server';
import { readFamilyHome } from '@/lib/business/coop-views';
import { linkNotFound, noStore } from '@/lib/business/public-access';
import { plausibleToken } from '@/lib/business/tokens';

type RouteContext = { params: Promise<{ token: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!plausibleToken(token)) return linkNotFound();
  const home = await readFamilyHome(token);
  if (!home) return linkNotFound();
  return NextResponse.json(home, { headers: noStore });
}
