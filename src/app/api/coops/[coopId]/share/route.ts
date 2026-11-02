// Creates the co-op's family link, or replaces it so the old link stops working.
import 'server-only';
import { NextResponse } from 'next/server';
import { requireCoopEditor } from '@/lib/business/coordinator-auth';
import { shareUrl } from '@/lib/business/families';
import { guardOrigin, serverError } from '@/lib/business/route-helpers';
import { newToken } from '@/lib/business/tokens';
import { ShareLink } from '@/lib/contracts/coop-features';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ coopId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const { coopId } = await context.params;
  const access = await requireCoopEditor(coopId);
  if (!access.ok) return access.response;
  try {
    const token = newToken();
    await prisma.coop.update({ where: { id: coopId }, data: { shareToken: token } });
    return NextResponse.json(ShareLink.parse({ shareUrl: shareUrl(token) }));
  } catch {
    return serverError();
  }
}
