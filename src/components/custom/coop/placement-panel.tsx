// Class placement: choose a class on the left; a sidebar lists children with "Select all"
// for the class's age group and checkboxes for exceptions (a child who tested up a level).
'use client';

import { Search, Users, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import styles from '@/components/custom/coop/coop.module.css';
import { errorMessage, post } from '@/components/custom/coop/shared';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import {
  AutoPlaceResult,
  FamilyOverview,
  type FamilyOverview as FamilyOverviewType,
} from '@/lib/contracts/coop-features';

export type RotationSummary = { ageGroup: string; classes: { id: string; name: string }[] };

type Props = {
  coopId: string;
  overview: FamilyOverviewType;
  onOverview: (overview: FamilyOverviewType) => void;
  reload: () => Promise<void>;
  rotations: RotationSummary[];
};

type ChildRow = {
  id: string;
  name: string;
  ageGroup: string | null;
  familyName: string;
};

const key = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

export function PlacementPanel({ coopId, overview, onOverview, reload, rotations }: Props) {
  const [classId, setClassId] = useState<string | null>(
    rotations[0]?.classes[0]?.id ?? overview.classes[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmAuto, setConfirmAuto] = useState(false);

  const children: ChildRow[] = useMemo(
    () =>
      overview.families.flatMap((family) =>
        family.children.map((child) => ({
          id: child.id,
          name: child.name,
          ageGroup: child.ageGroup,
          familyName: family.parentName,
        })),
      ),
    [overview],
  );
  const roster = overview.classes.find((item) => item.id === classId) ?? null;
  const statusByChild = useMemo(() => {
    const map = new Map<string, 'enrolled' | 'waitlisted'>();
    for (const family of overview.families) {
      for (const child of family.children) {
        const entry = child.enrollments.find((item) => item.classId === classId);
        if (entry) map.set(child.id, entry.status);
      }
    }
    return map;
  }, [overview, classId]);
  const saved = useMemo(
    () =>
      new Set([...statusByChild].filter(([, status]) => status === 'enrolled').map(([id]) => id)),
    [statusByChild],
  );
  const selected = draft ?? saved;
  const changes =
    [...selected].filter((id) => !saved.has(id)).length +
    [...saved].filter((id) => !selected.has(id)).length;

  // The age groups whose rotation includes this class.
  const classGroups = rotations
    .filter((rotation) => rotation.classes.some((item) => item.id === classId))
    .map((rotation) => rotation.ageGroup);
  const groupKeys = new Set(classGroups.map(key));
  const search = query.trim().toLowerCase();
  const matches = (child: ChildRow) =>
    !search || `${child.name} ${child.familyName}`.toLowerCase().includes(search);
  const inGroup = children.filter((child) => groupKeys.has(key(child.ageGroup)) && matches(child));
  const others = children.filter((child) => !groupKeys.has(key(child.ageGroup)) && matches(child));
  const otherSelected = others.filter((child) => selected.has(child.id)).length;

  function chooseClass(id: string) {
    if (changes && !window.confirm('Discard your unsaved changes to this class?')) return;
    setClassId(id);
    setDraft(null);
    setQuery('');
  }

  function toggle(childId: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(childId);
    else next.delete(childId);
    setDraft(next);
  }

  function selectGroup(ageGroup: string, on: boolean) {
    const next = new Set(selected);
    for (const child of children) {
      if (key(child.ageGroup) !== key(ageGroup)) continue;
      if (on) next.add(child.id);
      else next.delete(child.id);
    }
    setDraft(next);
  }

  async function save() {
    if (!classId) return;
    setSaving(true);
    try {
      onOverview(
        await apiFetch(`/api/coops/${coopId}/classes/${classId}/roster`, {
          ...post({ childIds: [...selected] }, 'PUT'),
          schema: FamilyOverview,
        }),
      );
      setDraft(null);
      toast.success(`${roster?.name ?? 'Class'} saved`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function placeEveryone() {
    setSaving(true);
    try {
      const result = await apiFetch(`/api/coops/${coopId}/placements/auto`, {
        ...post({}),
        schema: AutoPlaceResult,
      });
      await reload();
      setDraft(null);
      setConfirmAuto(false);
      toast.success(
        result.placed || result.waitlisted
          ? `Placed ${result.placed}${result.waitlisted ? `, ${result.waitlisted} on waitlists` : ''}`
          : 'Everyone is already in their age group’s classes',
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const scheduled = new Set(
    rotations.flatMap((rotation) => rotation.classes.map((item) => item.id)),
  );
  const unscheduled = overview.classes.filter((item) => !scheduled.has(item.id));
  const overCapacity = roster?.capacity != null && selected.size > roster.capacity;

  function childCheck(child: ChildRow, exception: boolean) {
    const status = statusByChild.get(child.id);
    return (
      <label className={styles.placementChild} key={child.id}>
        <input
          type="checkbox"
          checked={selected.has(child.id)}
          onChange={(event) => toggle(child.id, event.target.checked)}
        />
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>{child.name}</span>
          <span className={styles.rowMeta}>
            {child.familyName}
            {exception ? ` · ${child.ageGroup ?? 'No age group'}` : ''}
          </span>
        </span>
        {status === 'waitlisted' && !selected.has(child.id) && (
          <span className={`${styles.pill} ${styles.pillWarn}`}>Waitlist</span>
        )}
      </label>
    );
  }

  return (
    <section className={base.panel} aria-labelledby="placement-heading">
      <div className={base.panelHeader}>
        <div>
          <h2 className={base.panelTitle} id="placement-heading">
            Class placement
          </h2>
          <p className={base.muted} style={{ margin: '4px 0 0' }}>
            Coordinators decide where children go. Pick a class, then choose who’s in it.
          </p>
        </div>
        <button
          className={base.quietButton}
          type="button"
          disabled={saving || !rotations.length}
          onClick={() => setConfirmAuto(true)}
        >
          <Wand2 aria-hidden="true" size={15} /> Place everyone by age group
        </button>
      </div>
      {confirmAuto && (
        <div className={base.confirmBox} role="alert" style={{ marginBottom: 14 }}>
          <p className={base.confirmText}>
            Every child goes into all the classes of their age group’s rotation. Children already in
            a class stay where they are, and nobody is removed. Full classes put the extra children
            on the waitlist.
          </p>
          <div className={base.buttonRow}>
            <button
              className={base.button}
              type="button"
              disabled={saving}
              onClick={() => void placeEveryone()}
            >
              {saving ? 'Placing…' : 'Place everyone'}
            </button>
            <button
              className={base.quietButton}
              type="button"
              onClick={() => setConfirmAuto(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!overview.classes.length ? (
        <p className={base.muted}>Add classes on the Schedule tab first.</p>
      ) : (
        <div className={styles.placementLayout}>
          <div className={styles.stack} style={{ gap: 14 }}>
            {[
              ...rotations,
              ...(unscheduled.length
                ? [{ ageGroup: 'Not in the current schedule', classes: unscheduled }]
                : []),
            ].map((rotation) => (
              <div className={styles.attendanceGroup} key={rotation.ageGroup}>
                <h3 className={styles.groupTitle}>{rotation.ageGroup}</h3>
                {rotation.classes.map((item) => {
                  const stats = overview.classes.find((entry) => entry.id === item.id);
                  const active = item.id === classId;
                  return (
                    <button
                      key={`${rotation.ageGroup}-${item.id}`}
                      type="button"
                      className={`${styles.classPick} ${active ? styles.classPickActive : ''}`}
                      aria-pressed={active}
                      onClick={() => chooseClass(item.id)}
                    >
                      <span className={styles.rowTitle}>{item.name}</span>
                      {stats && (
                        <span
                          className={`${styles.pill} ${stats.capacity !== null && stats.enrolled > stats.capacity ? styles.pillBad : stats.capacity !== null && stats.enrolled === stats.capacity ? styles.pillWarn : ''}`}
                        >
                          {stats.capacity === null
                            ? `${stats.enrolled} in class`
                            : `${stats.enrolled} / ${stats.capacity}`}
                          {stats.waitlisted ? ` · ${stats.waitlisted} waiting` : ''}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {roster && (
            <aside className={styles.placementSidebar} aria-label={`Who’s in ${roster.name}`}>
              <div>
                <p className={base.eyebrow} style={{ margin: 0 }}>
                  Who’s in
                </p>
                <h3 className={styles.sectionTitle}>{roster.name}</h3>
                <p className={base.muted} style={{ margin: '4px 0 0' }}>
                  {selected.size} selected
                  {roster.capacity !== null ? ` · ${roster.capacity} seats` : ''}
                  {classGroups.length ? ` · for ${classGroups.join(', ')}` : ''}
                </p>
              </div>
              <div className={base.buttonRow}>
                {classGroups.map((ageGroup) => {
                  const members = children.filter((child) => key(child.ageGroup) === key(ageGroup));
                  const all =
                    members.length > 0 && members.every((child) => selected.has(child.id));
                  return (
                    <button
                      key={ageGroup}
                      className={all ? base.quietButton : base.button}
                      type="button"
                      disabled={!members.length}
                      onClick={() => selectGroup(ageGroup, !all)}
                    >
                      <Users aria-hidden="true" size={15} />
                      {all ? `Clear ${ageGroup}` : `Select all ${ageGroup} (${members.length})`}
                    </button>
                  );
                })}
              </div>
              {children.length > 8 && (
                <label className={styles.searchField}>
                  <Search aria-hidden="true" size={15} />
                  <input
                    type="search"
                    placeholder="Find a child"
                    aria-label="Find a child"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
              )}
              <div className={styles.placementList}>
                {classGroups.length > 0 && (
                  <>
                    <h4 className={styles.groupTitle}>{classGroups.join(', ')}</h4>
                    {inGroup.length ? (
                      inGroup.map((child) => childCheck(child, false))
                    ) : (
                      <p className={base.muted}>
                        No children in this age group{search ? ' match' : ' yet'}.
                      </p>
                    )}
                  </>
                )}
                <details
                  className={styles.otherGroups}
                  open={otherSelected > 0 || !classGroups.length || Boolean(search)}
                >
                  <summary>
                    {classGroups.length ? 'Add a child from another age group' : 'Children'}
                    {otherSelected ? ` (${otherSelected} added)` : ''}
                  </summary>
                  <div className={styles.stack} style={{ gap: 6, marginTop: 8 }}>
                    {others.length ? (
                      others.map((child) => childCheck(child, classGroups.length > 0))
                    ) : (
                      <p className={base.muted}>No other children{search ? ' match' : ''}.</p>
                    )}
                  </div>
                </details>
              </div>
              {overCapacity && (
                <output className={styles.note} style={{ display: 'block' }}>
                  That’s {selected.size - (roster.capacity ?? 0)} over the {roster.capacity} seats.
                  You can still save it.
                </output>
              )}
              <div className={base.buttonRow}>
                <button
                  className={base.button}
                  type="button"
                  disabled={saving || !changes}
                  onClick={() => void save()}
                >
                  {saving
                    ? 'Saving…'
                    : changes
                      ? `Save ${changes} ${changes === 1 ? 'change' : 'changes'}`
                      : 'Saved'}
                </button>
                {changes > 0 && (
                  <button className={base.quietButton} type="button" onClick={() => setDraft(null)}>
                    Undo changes
                  </button>
                )}
              </div>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
