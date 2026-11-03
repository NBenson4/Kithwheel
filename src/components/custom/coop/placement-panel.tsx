// Section placement: choose a grade section; a sidebar lists children with "Select all who
// signed up for this grade", children not placed yet, and children from other sections.
// A child in a section takes that section's whole schedule.
'use client';

import { Search, Users, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import styles from '@/components/custom/coop/coop.module.css';
import { errorMessage, post } from '@/components/custom/coop/shared';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import {
  AssignResult,
  FamilyOverview,
  type FamilyOverview as FamilyOverviewType,
} from '@/lib/contracts/coop-features';

type Props = {
  coopId: string;
  overview: FamilyOverviewType;
  onOverview: (overview: FamilyOverviewType) => void;
  reload: () => Promise<void>;
};

type ChildRow = {
  id: string;
  name: string;
  familyName: string;
  sectionId: string | null;
  sectionName: string | null;
  requestedSection: string | null;
  changes: number;
};

const key = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

export function PlacementPanel({ coopId, overview, onOverview, reload }: Props) {
  const [sectionId, setSectionId] = useState<string | null>(overview.sections[0]?.id ?? null);
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
          familyName: family.parentName,
          sectionId: child.sectionId,
          sectionName: child.sectionName,
          requestedSection: child.requestedSection,
          changes:
            child.skipped.length + child.classes.filter((item) => item.source === 'added').length,
        })),
      ),
    [overview],
  );
  const section = overview.sections.find((item) => item.id === sectionId) ?? null;
  const saved = useMemo(
    () =>
      new Set(children.filter((child) => child.sectionId === sectionId).map((child) => child.id)),
    [children, sectionId],
  );
  const selected = draft ?? saved;
  const changes =
    [...selected].filter((id) => !saved.has(id)).length +
    [...saved].filter((id) => !selected.has(id)).length;

  const search = query.trim().toLowerCase();
  const matches = (child: ChildRow) =>
    !search || `${child.name} ${child.familyName}`.toLowerCase().includes(search);
  const members = children.filter((child) => saved.has(child.id) && matches(child));
  const unplaced = children.filter((child) => !child.sectionId && matches(child));
  const elsewhere = children.filter(
    (child) => child.sectionId && child.sectionId !== sectionId && matches(child),
  );
  const askedForThis = section
    ? children.filter(
        (child) => !child.sectionId && key(child.requestedSection) === key(section.name),
      )
    : [];
  const allAsked = askedForThis.length > 0 && askedForThis.every((child) => selected.has(child.id));
  const unplacedTotal = children.filter((child) => !child.sectionId).length;
  const movedHere = elsewhere.filter((child) => selected.has(child.id)).length;

  function choose(id: string) {
    if (changes && !window.confirm('Discard your unsaved changes to this section?')) return;
    setSectionId(id);
    setDraft(null);
    setQuery('');
  }

  function toggle(childId: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(childId);
    else next.delete(childId);
    setDraft(next);
  }

  function selectAsked(on: boolean) {
    const next = new Set(selected);
    for (const child of askedForThis) {
      if (on) next.add(child.id);
      else next.delete(child.id);
    }
    setDraft(next);
  }

  async function save() {
    if (!sectionId) return;
    setSaving(true);
    try {
      onOverview(
        await apiFetch(`/api/coops/${coopId}/sections/${sectionId}/children`, {
          ...post({ childIds: [...selected] }, 'PUT'),
          schema: FamilyOverview,
        }),
      );
      setDraft(null);
      toast.success(`${section?.name ?? 'Section'} saved`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function placeRequested() {
    setSaving(true);
    try {
      const result = await apiFetch(`/api/coops/${coopId}/placements/requested`, {
        ...post({}),
        schema: AssignResult,
      });
      await reload();
      setDraft(null);
      setConfirmAuto(false);
      toast.success(
        result.assigned
          ? `${result.assigned} ${result.assigned === 1 ? 'child' : 'children'} placed`
          : 'No one was waiting with a grade that matches a section',
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function childCheck(child: ChildRow, note: string | null) {
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
            {note ? ` · ${note}` : ''}
          </span>
        </span>
        {child.changes > 0 && saved.has(child.id) && (
          <span className={styles.pill}>
            {child.changes} {child.changes === 1 ? 'change' : 'changes'}
          </span>
        )}
      </label>
    );
  }

  return (
    <section className={base.panel} aria-labelledby="placement-heading">
      <div className={base.panelHeader}>
        <div>
          <h2 className={base.panelTitle} id="placement-heading">
            Section placement
          </h2>
          <p className={base.muted} style={{ margin: '4px 0 0' }}>
            Pick a section, then choose who’s in it. Children take their section’s whole schedule.
            {unplacedTotal ? ` ${unplacedTotal} not placed yet.` : ''}
          </p>
        </div>
        <button
          className={base.quietButton}
          type="button"
          disabled={saving || !unplacedTotal}
          onClick={() => setConfirmAuto(true)}
        >
          <Wand2 aria-hidden="true" size={15} /> Place everyone in the grade they chose
        </button>
      </div>
      {confirmAuto && (
        <div className={base.confirmBox} role="alert" style={{ marginBottom: 14 }}>
          <p className={base.confirmText}>
            Each child who isn’t placed yet goes into the section matching the grade their family
            gave at sign-up. Children already in a section stay where they are.
          </p>
          <div className={base.buttonRow}>
            <button
              className={base.button}
              type="button"
              disabled={saving}
              onClick={() => void placeRequested()}
            >
              {saving ? 'Placing…' : 'Place them'}
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

      <div className={styles.placementLayout}>
        <div className={styles.stack} style={{ gap: 6 }}>
          {overview.sections.map((item) => {
            const count = children.filter((child) => child.sectionId === item.id).length;
            const waiting = children.filter(
              (child) => !child.sectionId && key(child.requestedSection) === key(item.name),
            ).length;
            const active = item.id === sectionId;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.classPick} ${active ? styles.classPickActive : ''}`}
                aria-pressed={active}
                onClick={() => choose(item.id)}
              >
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{item.name}</span>
                  <span className={styles.rowMeta}>
                    {item.classes.length} {item.classes.length === 1 ? 'class' : 'classes'}
                    {item.status === 'approved' ? '' : ' · draft'}
                  </span>
                </span>
                <span className={styles.rowActions}>
                  {waiting > 0 && (
                    <span className={`${styles.pill} ${styles.pillWarn}`}>{waiting} waiting</span>
                  )}
                  <span className={styles.pill}>
                    {count} {count === 1 ? 'child' : 'children'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {section && (
          <aside className={styles.placementSidebar} aria-label={`Who’s in ${section.name}`}>
            <div>
              <p className={base.eyebrow} style={{ margin: 0 }}>
                Who’s in
              </p>
              <h3 className={styles.sectionTitle}>{section.name}</h3>
              <p className={base.muted} style={{ margin: '4px 0 0' }}>
                {selected.size} selected
                {section.classes.length
                  ? ` · ${section.classes.map((item) => item.name).join(', ')}`
                  : ' · no classes yet'}
              </p>
            </div>
            {askedForThis.length > 0 && (
              <div className={base.buttonRow}>
                <button
                  className={allAsked ? base.quietButton : base.button}
                  type="button"
                  onClick={() => selectAsked(!allAsked)}
                >
                  <Users aria-hidden="true" size={15} />
                  {allAsked
                    ? `Clear the ${askedForThis.length} who signed up for ${section.name}`
                    : `Select all who signed up for ${section.name} (${askedForThis.length})`}
                </button>
              </div>
            )}
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
              <h4 className={styles.groupTitle}>In {section.name}</h4>
              {members.length ? (
                members.map((child) => childCheck(child, null))
              ) : (
                <p className={base.muted}>No one yet.</p>
              )}
              <h4 className={styles.groupTitle}>Not placed yet</h4>
              {unplaced.length ? (
                unplaced.map((child) =>
                  childCheck(
                    child,
                    child.requestedSection
                      ? `signed up for ${child.requestedSection}`
                      : 'no grade given',
                  ),
                )
              ) : (
                <p className={base.muted}>Everyone is placed{search ? ' (or no match)' : ''}.</p>
              )}
              <details className={styles.otherGroups} open={movedHere > 0 || Boolean(search)}>
                <summary>
                  Move a child from another section
                  {movedHere ? ` (${movedHere} moving here)` : ''}
                </summary>
                <div className={styles.stack} style={{ gap: 6, marginTop: 8 }}>
                  {elsewhere.length ? (
                    elsewhere.map((child) => childCheck(child, `now in ${child.sectionName}`))
                  ) : (
                    <p className={base.muted}>
                      No children in other sections{search ? ' match' : ''}.
                    </p>
                  )}
                </div>
              </details>
            </div>
            <p className={base.muted} style={{ margin: 0 }}>
              To change single classes for one child, open their family below.
            </p>
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
    </section>
  );
}
