// Calendar feed of the co-op's current schedule.
import 'server-only';
import {
  buildFeed,
  coopCalendarClasses,
  icsResponse,
  notReady,
} from '@/lib/business/calendar-feed';
import { coopByShareToken } from '@/lib/business/public-access';

type RouteContext = { params: Promise<{ token: string }> };

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const coop = await coopByShareToken(token);
  if (!coop) return new Response('Not found', { status: 404 });
  const feed = buildFeed(coop, await coopCalendarClasses(coop.id), coop.id);
  return feed ? icsResponse(feed, 'coop-schedule.ics') : notReady();
}
