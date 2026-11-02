import { describe, expect, it } from 'vitest';
import { buildCalendar, firstMeetingDate, zonedToUtc } from '@/lib/coop/calendar';
import { parseClassTime } from '@/lib/coop/class-time';
import { parseCsv, previewClassImport } from '@/lib/coop/csv';
import {
  computeBalance,
  dollarsToCents,
  formatHours,
  formatMoney,
  hoursToMinutes,
} from '@/lib/coop/money';

describe('parseClassTime', () => {
  it.each([
    ['9:00-9:50', 9, 0, 9, 50],
    ['9:00 AM – 9:50 AM', 9, 0, 9, 50],
    ['10am-11:15 AM', 10, 0, 11, 15],
    ['11-12:30pm', 11, 0, 12, 30],
    ['1:00-1:50', 13, 0, 13, 50],
    ['13:00-13:50', 13, 0, 13, 50],
    ['12:00-12:50', 12, 0, 12, 50],
    ['9:30 to 10:20', 9, 30, 10, 20],
  ])('%s', (text, sh, sm, eh, em) => {
    expect(parseClassTime(text)).toEqual({
      start: { hour: sh, minute: sm },
      end: { hour: eh, minute: em },
    });
  });

  it('gives a lone start time one hour', () => {
    expect(parseClassTime('10:15')).toEqual({
      start: { hour: 10, minute: 15 },
      end: { hour: 11, minute: 15 },
    });
  });

  it.each(['Morning block', 'After lunch', '', null, '10-9', '25:00-26:00'])(
    'rejects %s',
    (text) => {
      expect(parseClassTime(text)).toBeNull();
    },
  );
});

describe('calendar', () => {
  it('finds the first meeting day on or after the term start', () => {
    expect(firstMeetingDate('2027-01-04', 2)).toBe('2027-01-05'); // Monday → Tuesday
    expect(firstMeetingDate('2027-01-05', 2)).toBe('2027-01-05');
  });

  it('converts wall-clock time across daylight saving', () => {
    expect(zonedToUtc('2027-01-05', { hour: 9, minute: 0 }, 'America/New_York').toISOString()).toBe(
      '2027-01-05T14:00:00.000Z',
    );
    expect(zonedToUtc('2027-07-06', { hour: 9, minute: 0 }, 'America/New_York').toISOString()).toBe(
      '2027-07-06T13:00:00.000Z',
    );
  });

  it('builds weekly events, escapes text and folds long lines', () => {
    const ics = buildCalendar({
      calendarName: 'Maple Grove',
      timeZone: 'America/New_York',
      meetingDay: 2,
      termStart: '2027-01-04',
      termEnd: '2027-05-11',
      uidScope: 'coop1',
      now: new Date('2026-11-02T12:00:00Z'),
      classes: [
        {
          id: 'c1',
          name: 'Art, paint; clay',
          time: '9:00-9:50',
          room: 'Room 2',
          teacher: 'Ms. Rivera',
          materials:
            'Sketchbook and a very long list of colored pencils, markers, glue sticks, scissors and paper',
          forWhom: ['K-2'],
        },
        {
          id: 'c2',
          name: 'Lunch',
          time: 'After class',
          room: null,
          teacher: null,
          materials: null,
          forWhom: [],
        },
      ],
    });
    expect(ics).toContain('DTSTART;TZID=America/New_York:20270105T090000');
    expect(ics).toContain('DTEND;TZID=America/New_York:20270105T095000');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20270512T035900Z');
    expect(ics).toContain(String.raw`SUMMARY:Art\, paint\; clay`);
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20270511');
    expect(ics).toContain('DESCRIPTION:Lunch · After class');
    for (const line of ics.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

describe('class import', () => {
  it('reads quoted CSV and tab-separated paste', () => {
    expect(parseCsv('a,"b, c","d ""q"""\n1,2,3')).toEqual([
      ['a', 'b, c', 'd "q"'],
      ['1', '2', '3'],
    ]);
    expect(parseCsv('Name\tRoom\nArt\t2')).toEqual([
      ['Name', 'Room'],
      ['Art', '2'],
    ]);
  });

  it('maps columns and reports bad rows', () => {
    const preview = previewClassImport(
      'Class,Instructor,Seats,Supply fee,Unknown\nArt,Ms. R,12,$15.50,x\n,Nobody,3,,\nMusic,,lots,,',
    );
    expect(preview.rows).toEqual([
      { name: 'Art', teacher: 'Ms. R', capacity: 12, feeCents: 1550 },
      { name: 'Music' },
    ]);
    expect(preview.problems.map((problem) => problem.row)).toEqual([3, 4]);
  });

  it('requires a name column', () => {
    expect(previewClassImport('Teacher\nMs. R').problems[0]?.message).toMatch(/Name/);
  });
});

describe('money and hours', () => {
  it('formats and parses amounts', () => {
    expect(formatMoney(123456)).toBe('$1,234.56');
    expect(formatMoney(-500)).toBe('-$5.00');
    expect(dollarsToCents('$1,200.5')).toBe(120050);
    expect(dollarsToCents('')).toBe(0);
    expect(dollarsToCents('abc')).toBeNull();
    expect(hoursToMinutes('1.5')).toBe(90);
    expect(hoursToMinutes('0')).toBeNull();
    expect(formatHours(90)).toBe('1.5 hours');
    expect(formatHours(60)).toBe('1 hour');
  });

  it('adds up a family balance', () => {
    const balance = computeBalance({
      familyFeeCents: 5000,
      childFeeCents: 2000,
      childCount: 2,
      classFees: [{ label: 'Art (Ann)', amountCents: 1500 }],
      charges: [{ label: 'Sibling discount', amountCents: -1000 }],
      paymentsCents: [3000],
    });
    expect(balance.totalCents).toBe(5000 + 4000 + 1500 - 1000);
    expect(balance.paidCents).toBe(3000);
    expect(balance.balanceCents).toBe(6500);
    expect(balance.lines.map((line) => line.label)).toEqual([
      'Family fee',
      'Per-child fee × 2',
      'Art (Ann)',
      'Sibling discount',
    ]);
  });
});
