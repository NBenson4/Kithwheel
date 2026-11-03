// Pure rules for which classes a child takes: everything in their grade section, minus the
// section classes a coordinator marked "skip", plus single classes taken from other sections.
import { parseClassTime } from '@/lib/coop/class-time';

export const DEFAULT_SECTIONS = [
  'Pre-K',
  'Kindergarten',
  '1st grade',
  '2nd grade',
  '3rd grade',
  '4th grade',
  '5th grade',
  '6th–7th grade',
  '8th–12th grade',
] as const;

export type ExceptionKind = 'ADD' | 'SKIP';

export type ChildPlacement<C extends { id: string }> = {
  /** Classes of the child's own section, in schedule order. */
  sectionClasses: C[];
  exceptions: { kind: ExceptionKind; class: C }[];
};

export type EffectiveClass<C> = { item: C; source: 'section' | 'added' };

export function effectiveClasses<C extends { id: string }>(
  placement: ChildPlacement<C>,
): EffectiveClass<C>[] {
  const skipped = new Set(
    placement.exceptions.filter((entry) => entry.kind === 'SKIP').map((entry) => entry.class.id),
  );
  const own = placement.sectionClasses
    .filter((item) => !skipped.has(item.id))
    .map((item) => ({ item, source: 'section' as const }));
  const ownIds = new Set(placement.sectionClasses.map((item) => item.id));
  const added = placement.exceptions
    .filter((entry) => entry.kind === 'ADD' && !ownIds.has(entry.class.id))
    .map((entry) => ({ item: entry.class, source: 'added' as const }));
  return [...own, ...added];
}

const minutes = (time: { hour: number; minute: number }) => time.hour * 60 + time.minute;

/** True when two free-text class times (e.g. "9:00-9:50") overlap. Unreadable times never clash. */
export function timesOverlap(a: string | null | undefined, b: string | null | undefined): boolean {
  const first = parseClassTime(a);
  const second = parseClassTime(b);
  if (!first || !second) return false;
  return minutes(first.start) < minutes(second.end) && minutes(second.start) < minutes(first.end);
}

/** Pairs of class names in one child's schedule that happen at the same time. */
export function clashes<C extends { id: string; name: string; time: string | null }>(
  classes: C[],
): [string, string][] {
  const found: [string, string][] = [];
  for (let i = 0; i < classes.length; i += 1) {
    for (let j = i + 1; j < classes.length; j += 1) {
      const a = classes[i];
      const b = classes[j];
      if (a && b && timesOverlap(a.time, b.time)) found.push([a.name, b.name]);
    }
  }
  return found;
}
