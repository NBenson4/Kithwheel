// Builds the iCalendar (.ics) feed families subscribe to: one weekly event per class on
// the co-op day, between the term dates. Pure, so it is unit tested directly.
import { type ClockTime, parseClassTime } from '@/lib/coop/class-time';

export type CalendarClass = {
  id: string;
  name: string;
  time: string | null;
  room: string | null;
  teacher: string | null;
  materials: string | null;
  /** Age groups (or children) shown in the event description. */
  forWhom: string[];
};

export type CalendarInput = {
  calendarName: string;
  timeZone: string;
  /** 0 = Sunday … 6 = Saturday. */
  meetingDay: number;
  /** YYYY-MM-DD */
  termStart: string;
  /** YYYY-MM-DD */
  termEnd: string;
  classes: CalendarClass[];
  /** Stable suffix for event UIDs, e.g. the co-op or family id. */
  uidScope: string;
  now?: Date;
};

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Folds lines longer than 75 octets, as RFC 5545 requires. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const charSize = new TextEncoder().encode(char).length;
    const limit = out.length === 0 ? 75 : 74;
    if (size + charSize > limit) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += charSize;
  }
  out.push(current);
  return out.join('\r\n ');
}

const pad = (value: number) => String(value).padStart(2, '0');

function ymd(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year: year ?? 1970, month: month ?? 1, day: day ?? 1 };
}

/** The first date on or after `start` that falls on `weekday`. */
export function firstMeetingDate(start: string, weekday: number): string {
  const { year, month, day } = ymd(start);
  const date = new Date(Date.UTC(year, month - 1, day));
  const shift = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + shift);
  return date.toISOString().slice(0, 10);
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - instant;
}

/** A wall-clock time in `timeZone` as a UTC instant. */
export function zonedToUtc(date: string, time: ClockTime, timeZone: string): Date {
  const { year, month, day } = ymd(date);
  const guess = Date.UTC(year, month - 1, day, time.hour, time.minute);
  const first = guess - zoneOffset(guess, timeZone);
  // Re-check once in case the guess crossed a daylight-saving change.
  return new Date(guess - zoneOffset(first, timeZone));
}

function utcStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

function localStamp(date: string, time: ClockTime): string {
  return `${date.replace(/-/g, '')}T${pad(time.hour)}${pad(time.minute)}00`;
}

export function buildCalendar(input: CalendarInput): string {
  const firstDate = firstMeetingDate(input.termStart, input.meetingDay);
  const until = utcStamp(zonedToUtc(input.termEnd, { hour: 23, minute: 59 }, input.timeZone));
  const stamp = utcStamp(input.now ?? new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kithwheel//Co-op schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(input.calendarName)}`,
    `X-WR-TIMEZONE:${input.timeZone}`,
  ];

  const untimed: CalendarClass[] = [];
  for (const item of input.classes) {
    const time = parseClassTime(item.time);
    if (!time) {
      untimed.push(item);
      continue;
    }
    const details = [
      item.forWhom.length ? `For: ${item.forWhom.join(', ')}` : '',
      item.teacher ? `Teacher: ${item.teacher}` : '',
      item.materials ? `Materials: ${item.materials}` : '',
    ].filter(Boolean);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.id}.${input.uidScope}@kithwheel.org`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${input.timeZone}:${localStamp(firstDate, time.start)}`,
      `DTEND;TZID=${input.timeZone}:${localStamp(firstDate, time.end)}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${until}`,
      `SUMMARY:${escapeText(item.name)}`,
      ...(item.room ? [`LOCATION:${escapeText(item.room)}`] : []),
      ...(details.length ? [`DESCRIPTION:${escapeText(details.join('\n'))}`] : []),
      'END:VEVENT',
    );
  }

  // Classes without a readable time go into one all-day "co-op day" event.
  const { year, month, day } = ymd(firstDate);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const dayLines = untimed.map((item) =>
    [item.name, item.time, item.room].filter(Boolean).join(' · '),
  );
  lines.push(
    'BEGIN:VEVENT',
    `UID:coop-day.${input.uidScope}@kithwheel.org`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${firstDate.replace(/-/g, '')}`,
    `DTEND;VALUE=DATE:${nextDay.replace(/-/g, '')}`,
    `RRULE:FREQ=WEEKLY;UNTIL=${input.termEnd.replace(/-/g, '')}`,
    `SUMMARY:${escapeText(`${input.calendarName} co-op day`)}`,
    ...(dayLines.length ? [`DESCRIPTION:${escapeText(dayLines.join('\n'))}`] : []),
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
