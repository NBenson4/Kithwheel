// Calendar feed of the classes one family's children take.
import 'server-only';
import { buildFeed, icsResponse, notReady } from '@/lib/business/calendar-feed';
import { childInclude, childSchedule } from '@/lib/business/families';
import { familyByToken } from '@/lib/business/public-access';
import type { CalendarClass } from '@/lib/coop/calendar';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ token: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const family = await familyByToken(token);
  if (!family) return new Response('Not found', { status: 404 });
  const children = await prisma.coopChild.findMany({
    where: { familyId: family.id },
    orderBy: { createdAt: 'asc' },
    include: childInclude,
  });
  const byId = new Map<string, CalendarClass>();
  for (const child of children) {
    for (const { item } of childSchedule(child, { approvedOnly: true })) {
      const existing = byId.get(item.id);
      if (existing) existing.forWhom.push(child.name);
      else byId.set(item.id, { ...item, forWhom: [child.name] });
    }
  }
  const feed = buildFeed(family.coop, [...byId.values()], family.id);
  return feed ? icsResponse(feed, 'family-schedule.ics') : notReady();
}
