// Reads the free-text class time coordinators type ("9:00–9:50", "10am - 11:15 AM",
// "1:00-1:50") into start and end clock times, for the calendar feed.

export type ClockTime = { hour: number; minute: number };
export type ClassTime = { start: ClockTime; end: ClockTime };

type Part = { hour: number; minute: number; meridiem: 'am' | 'pm' | null };

const PART = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|a|p)?/i;

function readPart(text: string): Part | null {
  const match = text.trim().match(new RegExp(`^${PART.source}$`, 'i'));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  const raw = match[3]?.toLowerCase().replace(/\./g, '');
  const meridiem = raw ? (raw.startsWith('a') ? 'am' : 'pm') : null;
  if (meridiem && (hour < 1 || hour > 12)) return null;
  return { hour, minute, meridiem };
}

function to24(part: Part, meridiem: 'am' | 'pm' | null): ClockTime {
  if (!meridiem || part.hour > 12) return { hour: part.hour, minute: part.minute };
  const base = part.hour % 12;
  return { hour: meridiem === 'pm' ? base + 12 : base, minute: part.minute };
}

const minutesOf = (time: ClockTime) => time.hour * 60 + time.minute;

/** Null when the text can't be read as a time range (or a single start time). */
export function parseClassTime(text: string | null | undefined): ClassTime | null {
  if (!text) return null;
  const pieces = text
    .replace(/\s+(to|until)\s+/gi, '-')
    .split(/\s*[-–—]\s*/)
    .filter(Boolean);
  if (pieces.length < 1 || pieces.length > 2) return null;
  const first = readPart(pieces[0] ?? '');
  if (!first) return null;
  const second = pieces[1] ? readPart(pieces[1]) : null;
  if (pieces[1] && !second) return null;

  if (!second) {
    // A lone start time: guess one hour. Bare small numbers ("1:00") are afternoon.
    const start = to24(first, first.meridiem ?? (first.hour < 7 ? 'pm' : null));
    return { start, end: { hour: Math.min(23, start.hour + 1), minute: start.minute } };
  }

  let startMeridiem = first.meridiem;
  const endMeridiem = second.meridiem ?? (second.hour < 7 && !first.meridiem ? 'pm' : null);
  const end = to24(second, endMeridiem);
  if (!startMeridiem && endMeridiem) {
    // "11-12:30pm": the start shares the end's half of the day unless that puts it after the end.
    startMeridiem = endMeridiem;
    if (minutesOf(to24(first, startMeridiem)) > minutesOf(end)) {
      startMeridiem = endMeridiem === 'pm' ? 'am' : null;
    }
  }
  const start = to24(first, startMeridiem);
  if (minutesOf(start) >= minutesOf(end)) return null;
  return { start, end };
}
