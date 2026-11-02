// Calendar feed of the classes one family's children are enrolled in.
import 'server-only';
import { buildFeed, icsResponse, notReady } from '@/lib/business/calendar-feed';
import { familyByToken } from '@/lib/business/public-access';
import type { CalendarClass } from '@/lib/coop/calendar';
import { prisma } from '@/lib/db';

type RouteContext = { params: Promise<{ token: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const family = await familyByToken(token);
  if (!family) return new Response('Not found', { status: 404 });
  const enrollments = await prisma.coopEnrollment.findMany({
    where: { child: { familyId: family.id }, status: 'ENROLLED' },
    include: { child: { select: { name: true } }, class: true },
    orderBy: { createdAt: 'asc' },
  });
  const byId = new Map<string, CalendarClass>();
  for (const entry of enrollments) {
    const existing = byId.get(entry.classId);
    if (existing) existing.forWhom.push(entry.child.name);
    else byId.set(entry.classId, { ...entry.class, forWhom: [entry.child.name] });
  }
  const feed = buildFeed(family.coop, [...byId.values()], family.id);
  return feed ? icsResponse(feed, 'family-schedule.ics') : notReady();
}
