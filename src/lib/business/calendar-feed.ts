// Serves .ics feeds for the co-op link and for each family.
import 'server-only';
import { calendarReady } from '@/lib/business/coop-views';
import { isoDay, readPublicSchedule } from '@/lib/business/families';
import { buildCalendar, type CalendarClass } from '@/lib/coop/calendar';

type CoopCalendarFields = {
  id: string;
  name: string;
  timeZone: string;
  meetingDay: number | null;
  termStart: Date | null;
  termEnd: Date | null;
};

export function icsResponse(body: string, filename: string) {
  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'public, max-age=900',
      'x-robots-tag': 'noindex',
    },
  });
}

export function notReady() {
  return new Response('This co-op hasn’t set its co-op day and term dates yet.', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

export function buildFeed(coop: CoopCalendarFields, classes: CalendarClass[], scope: string) {
  if (!calendarReady(coop) || !coop.termStart || !coop.termEnd || coop.meetingDay === null) {
    return null;
  }
  return buildCalendar({
    calendarName: coop.name,
    timeZone: coop.timeZone,
    meetingDay: coop.meetingDay,
    termStart: isoDay(coop.termStart),
    termEnd: isoDay(coop.termEnd),
    classes,
    uidScope: scope,
  });
}

/** Every class in the current schedule, labelled with the age groups taking it. */
export async function coopCalendarClasses(coopId: string): Promise<CalendarClass[]> {
  const schedule = await readPublicSchedule(coopId);
  const byId = new Map<string, CalendarClass>();
  for (const rotation of schedule?.rotations ?? []) {
    for (const item of rotation.classes) {
      const existing = byId.get(item.id);
      if (existing) existing.forWhom.push(rotation.ageGroup);
      else byId.set(item.id, { ...item, forWhom: [rotation.ageGroup] });
    }
  }
  return [...byId.values()];
}
