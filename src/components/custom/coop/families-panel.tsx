// Families tab: registration, section placement, and each family's details (including
// each child's schedule and case-by-case class changes).
'use client';

import { Download, Mail, Plus, Trash2, UserPlus } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import styles from '@/components/custom/coop/coop.module.css';
import { PlacementPanel } from '@/components/custom/coop/placement-panel';
import { FamilyLinkCard } from '@/components/custom/coop/settings-panel';
import { copyText, downloadCsv, errorMessage, post } from '@/components/custom/coop/shared';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import {
  CoopSettings,
  type CoopSettings as CoopSettingsType,
  FamilyOverview,
  type FamilyOverview as FamilyOverviewType,
  type FamilyRecord,
  type SectionSummary,
} from '@/lib/contracts/coop-features';

type Props = {
  coopId: string;
  settings: CoopSettingsType;
  onSettings: (settings: CoopSettingsType) => void;
};

type ChildDraft = { name: string; sectionId: string };
const emptyChild = (): ChildDraft => ({ name: '', sectionId: '' });
const toChildInput = (child: ChildDraft) => ({
  name: child.name,
  sectionId: child.sectionId || null,
});

type SectionOption = { id: string; name: string };

function RegistrationCard({ coopId, settings, onSettings }: Props) {
  const [note, setNote] = useState(settings.registrationNote ?? '');
  const [saving, setSaving] = useState(false);

  async function update(body: Record<string, unknown>, message: string) {
    setSaving(true);
    try {
      onSettings(
        await apiFetch(`/api/coops/${coopId}/settings`, {
          ...post(body, 'PATCH'),
          schema: CoopSettings,
        }),
      );
      toast.success(message);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={base.panel} aria-labelledby="registration-heading">
      <div className={base.panelHeader}>
        <h2 className={base.panelTitle} id="registration-heading">
          Registration
        </h2>
        <span className={`${styles.pill} ${settings.registrationOpen ? styles.pillGood : ''}`}>
          {settings.registrationOpen ? 'Open' : 'Closed'}
        </span>
      </div>
      <div className={styles.stack}>
        <p className={base.muted}>
          While registration is open, your family link shows a short sign-up form: the parent’s name
          and email, and each child’s name and age group. Families don’t choose classes.
        </p>
        <div className={base.buttonRow}>
          <button
            className={settings.registrationOpen ? base.quietButton : base.button}
            type="button"
            disabled={saving}
            onClick={() =>
              void update(
                { registrationOpen: !settings.registrationOpen },
                settings.registrationOpen ? 'Registration closed' : 'Registration is open',
              )
            }
          >
            {settings.registrationOpen ? 'Close registration' : 'Open registration'}
          </button>
        </div>
        <label className={base.smallLabel} htmlFor="registration-note">
          Note shown above the form (optional)
          <textarea
            id="registration-note"
            className={styles.textarea}
            value={note}
            maxLength={1000}
            placeholder="e.g. Registration closes August 15. Families new to the co-op, please email us first."
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <div className={base.buttonRow}>
          <button
            className={base.quietButton}
            type="button"
            disabled={saving || note === (settings.registrationNote ?? '')}
            onClick={() => void update({ registrationNote: note || null }, 'Note saved')}
          >
            Save note
          </button>
        </div>
      </div>
    </section>
  );
}

export function SectionSelect({
  id,
  value,
  sections,
  onChange,
  label = 'Section',
  emptyLabel = 'Not placed yet',
}: {
  id: string;
  value: string;
  sections: SectionOption[];
  onChange: (value: string) => void;
  label?: string;
  emptyLabel?: string;
}) {
  return (
    <label className={base.smallLabel} htmlFor={id}>
      {label}
      <select
        id={id}
        className={base.select}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {section.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChildFields({
  child,
  index,
  sections,
  onChange,
  onRemove,
}: {
  child: ChildDraft;
  index: number;
  sections: SectionOption[];
  onChange: (child: ChildDraft) => void;
  onRemove?: () => void;
}) {
  return (
    <div className={styles.childCard}>
      <div className={base.optionalGrid}>
        <label className={base.smallLabel} htmlFor={`child-name-${index}`}>
          Child’s name
          <input
            id={`child-name-${index}`}
            className={base.field}
            value={child.name}
            required
            maxLength={120}
            onChange={(event) => onChange({ ...child, name: event.target.value })}
          />
        </label>
        <SectionSelect
          id={`child-section-${index}`}
          value={child.sectionId}
          sections={sections}
          onChange={(sectionId) => onChange({ ...child, sectionId })}
        />
      </div>
      {onRemove && (
        <div className={base.buttonRow}>
          <button className={styles.chipButton} type="button" onClick={onRemove}>
            Remove child
          </button>
        </div>
      )}
    </div>
  );
}

function AddFamilyForm({
  coopId,
  sections,
  onDone,
}: {
  coopId: string;
  sections: SectionOption[];
  onDone: (overview: FamilyOverviewType) => void;
}) {
  const [parentName, setParentName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [children, setChildren] = useState<ChildDraft[]>([emptyChild()]);
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const overview = await apiFetch(`/api/coops/${coopId}/families`, {
        ...post({ parentName, email, phone, children: children.map(toChildInput), sendEmail }),
        schema: FamilyOverview,
      });
      toast.success(`${parentName} added${sendEmail ? ' and emailed their family link' : ''}`);
      onDone(overview);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={base.inlineForm} onSubmit={submit}>
      <div className={styles.grid3}>
        <label className={base.smallLabel} htmlFor="family-parent">
          Parent or guardian
          <input
            id="family-parent"
            className={base.field}
            value={parentName}
            required
            maxLength={120}
            onChange={(event) => setParentName(event.target.value)}
          />
        </label>
        <label className={base.smallLabel} htmlFor="family-email">
          Email
          <input
            id="family-email"
            className={base.field}
            type="email"
            value={email}
            required
            maxLength={200}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className={base.smallLabel} htmlFor="family-phone">
          Phone (optional)
          <input
            id="family-phone"
            className={base.field}
            value={phone}
            maxLength={40}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
      </div>
      {children.map((child, index) => (
        <ChildFields
          // biome-ignore lint/suspicious/noArrayIndexKey: children are edited in place by position.
          key={index}
          child={child}
          index={index}
          sections={sections}
          onChange={(next) => setChildren(children.map((item, i) => (i === index ? next : item)))}
          onRemove={
            children.length > 1
              ? () => setChildren(children.filter((_, i) => i !== index))
              : undefined
          }
        />
      ))}
      <div className={base.buttonRow}>
        <button
          className={base.quietButton}
          type="button"
          disabled={children.length >= 12}
          onClick={() => setChildren([...children, emptyChild()])}
        >
          <Plus aria-hidden="true" size={14} /> Another child
        </button>
      </div>
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={sendEmail}
          onChange={(event) => setSendEmail(event.target.checked)}
        />
        Email this family the link to their family page
      </label>
      <div className={base.buttonRow}>
        <button className={base.button} type="submit" disabled={saving}>
          {saving ? 'Adding…' : 'Add family'}
        </button>
      </div>
    </form>
  );
}

function FamilyDetails({
  coopId,
  family,
  sections,
  onOverview,
}: {
  coopId: string;
  family: FamilyRecord;
  sections: SectionSummary[];
  onOverview: (overview: FamilyOverviewType) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    parentName: family.parentName,
    email: family.email,
    phone: family.phone ?? '',
    notes: family.notes ?? '',
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [newChild, setNewChild] = useState<ChildDraft>(emptyChild());
  const [pickClass, setPickClass] = useState<Record<string, string>>({});
  const [removingChild, setRemovingChild] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(path: string, init: RequestInit, message: string) {
    setBusy(true);
    try {
      onOverview(await apiFetch(path, { ...init, schema: FamilyOverview }));
      toast.success(message);
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    try {
      await apiFetch(`/api/coops/${coopId}/families/${family.id}/resend`, post({}));
      toast.success(`Family link emailed to ${family.email}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const childCount = family.children.length;
  const unplaced = family.children.filter((child) => !child.sectionId).length;
  return (
    <details className={styles.details}>
      <summary>
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>{family.parentName}</span>
          <span className={styles.rowMeta}>
            {family.children.map((child) => child.name).join(', ') || 'No children yet'} ·{' '}
            {family.email}
          </span>
        </span>
        <span className={styles.rowActions}>
          {unplaced > 0 && (
            <span className={`${styles.pill} ${styles.pillWarn}`}>
              {unplaced === childCount ? 'Not placed yet' : `${unplaced} not placed`}
            </span>
          )}
          <span className={styles.pill}>
            {childCount} {childCount === 1 ? 'child' : 'children'}
          </span>
        </span>
      </summary>
      <div className={styles.detailsBody}>
        <div className={base.buttonRow}>
          <button
            className={styles.chipButton}
            type="button"
            onClick={() => void copyText(family.familyUrl, 'Family page link copied')}
          >
            Copy family page link
          </button>
          <button className={styles.chipButton} type="button" onClick={() => void resend()}>
            <Mail aria-hidden="true" size={12} /> Email them the link
          </button>
          <button
            className={styles.chipButton}
            type="button"
            onClick={() => setEditing((open) => !open)}
          >
            Edit contact and notes
          </button>
        </div>
        {family.phone && <p className={base.muted}>Phone: {family.phone}</p>}
        {family.notes && !editing && (
          <p className={`${styles.note} ${styles.prewrap}`}>{family.notes}</p>
        )}
        {editing && (
          <form
            className={base.inlineForm}
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await run(
                `/api/coops/${coopId}/families/${family.id}`,
                post({ ...draft, phone: draft.phone || null, notes: draft.notes || null }, 'PATCH'),
                'Family saved',
              );
              if (ok) setEditing(false);
            }}
          >
            <div className={styles.grid3}>
              <label className={base.smallLabel}>
                Parent or guardian
                <input
                  className={base.field}
                  value={draft.parentName}
                  required
                  maxLength={120}
                  onChange={(event) => setDraft({ ...draft, parentName: event.target.value })}
                />
              </label>
              <label className={base.smallLabel}>
                Email
                <input
                  className={base.field}
                  type="email"
                  value={draft.email}
                  required
                  maxLength={200}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                />
              </label>
              <label className={base.smallLabel}>
                Phone
                <input
                  className={base.field}
                  value={draft.phone}
                  maxLength={40}
                  onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                />
              </label>
            </div>
            <label className={base.smallLabel}>
              Coordinator notes (families don’t see these)
              <textarea
                className={styles.textarea}
                value={draft.notes}
                maxLength={2000}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              />
            </label>
            <div className={base.buttonRow}>
              <button className={base.button} type="submit" disabled={busy}>
                Save
              </button>
              <button className={base.quietButton} type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {family.children.map((child) => {
          const ownSection = sections.find((section) => section.id === child.sectionId);
          const taking = new Set(child.classes.map((item) => item.classId));
          const skipped = new Set(child.skipped.map((item) => item.classId));
          const otherSections = sections.filter(
            (section) => section.id !== child.sectionId && section.classes.length,
          );
          return (
            <div className={styles.childCard} key={child.id}>
              <div className={styles.row} style={{ padding: 0, border: 0, background: 'none' }}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{child.name}</span>
                  {!child.sectionId && child.requestedSection && (
                    <span className={styles.rowMeta}>Signed up for {child.requestedSection}</span>
                  )}
                </span>
                <span className={styles.rowActions} style={{ alignItems: 'flex-end' }}>
                  <SectionSelect
                    id={`section-${child.id}`}
                    value={child.sectionId ?? ''}
                    sections={sections}
                    onChange={(sectionId) =>
                      void run(
                        `/api/coops/${coopId}/children/${child.id}`,
                        post({ sectionId: sectionId || null }, 'PATCH'),
                        sectionId
                          ? `${child.name} is now in ${sections.find((section) => section.id === sectionId)?.name}`
                          : `${child.name} is no longer in a section`,
                      )
                    }
                  />
                  {removingChild === child.id ? (
                    <>
                      <button
                        className={base.dangerButtonSolid}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            `/api/coops/${coopId}/children/${child.id}`,
                            post({}, 'DELETE'),
                            `${child.name} removed`,
                          )
                        }
                      >
                        Yes, remove {child.name}
                      </button>
                      <button
                        className={styles.chipButton}
                        type="button"
                        onClick={() => setRemovingChild(null)}
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      className={styles.chipButton}
                      type="button"
                      onClick={() => setRemovingChild(child.id)}
                    >
                      Remove child
                    </button>
                  )}
                </span>
              </div>

              {ownSection ? (
                <>
                  <span className={styles.groupTitle}>{ownSection.name} schedule</span>
                  {ownSection.classes.length ? (
                    <ul className={styles.list}>
                      {ownSection.classes.map((item) => {
                        const isSkipped = skipped.has(item.id);
                        return (
                          <li className={styles.row} key={item.id}>
                            <span className={styles.rowMain}>
                              <span
                                className={styles.rowTitle}
                                style={
                                  isSkipped
                                    ? { textDecoration: 'line-through', opacity: 0.6 }
                                    : undefined
                                }
                              >
                                {item.name}
                              </span>
                              <span className={styles.rowMeta}>
                                {item.time ?? 'No time set'}
                                {isSkipped ? ' · skipped for this child' : ''}
                              </span>
                            </span>
                            <span className={styles.rowActions}>
                              {isSkipped ? (
                                <button
                                  className={styles.chipButton}
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(
                                      `/api/coops/${coopId}/children/${child.id}/exceptions/${item.id}`,
                                      post({}, 'DELETE'),
                                      `${child.name} is back in ${item.name}`,
                                    )
                                  }
                                >
                                  Put back
                                </button>
                              ) : (
                                <button
                                  className={styles.chipButton}
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(
                                      `/api/coops/${coopId}/children/${child.id}/exceptions`,
                                      post({ classId: item.id, kind: 'skip' }),
                                      `${child.name} will skip ${item.name}`,
                                    )
                                  }
                                >
                                  Skip this class
                                </button>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className={base.muted}>{ownSection.name} has no classes yet.</p>
                  )}
                </>
              ) : (
                <p className={styles.note}>
                  Not placed yet. Choose a section above, or use Section placement.
                </p>
              )}

              {child.classes.some((item) => item.source === 'added') && (
                <>
                  <span className={styles.groupTitle}>From other sections</span>
                  <ul className={styles.list}>
                    {child.classes
                      .filter((item) => item.source === 'added')
                      .map((item) => (
                        <li className={styles.row} key={item.classId}>
                          <span className={styles.rowMain}>
                            <span className={styles.rowTitle}>{item.className}</span>
                            <span className={styles.rowMeta}>
                              {item.sectionName} · {item.time ?? 'No time set'}
                            </span>
                          </span>
                          <button
                            className={styles.chipButton}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                `/api/coops/${coopId}/children/${child.id}/exceptions/${item.classId}`,
                                post({}, 'DELETE'),
                                `${child.name} dropped ${item.className}`,
                              )
                            }
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                  </ul>
                </>
              )}

              {child.clashes.length > 0 && (
                <p className={styles.note} role="status">
                  Time clash:{' '}
                  {child.clashes.map(([first, second]) => `${first} and ${second}`).join('; ')}.
                  Skip one of them if {child.name} is taking the other instead.
                </p>
              )}

              {otherSections.length > 0 && (
                <div className={base.buttonRow}>
                  <select
                    className={base.select}
                    aria-label={`Add a class from another section for ${child.name}`}
                    value={pickClass[child.id] ?? ''}
                    onChange={(event) =>
                      setPickClass({ ...pickClass, [child.id]: event.target.value })
                    }
                  >
                    <option value="">Add a class from another section…</option>
                    {otherSections.map((section) => (
                      <optgroup key={section.id} label={section.name}>
                        {section.classes
                          .filter((item) => !taking.has(item.id))
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                              {item.time ? ` (${item.time})` : ''}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                  <button
                    className={base.quietButton}
                    type="button"
                    disabled={busy || !pickClass[child.id]}
                    onClick={async () => {
                      const ok = await run(
                        `/api/coops/${coopId}/children/${child.id}/exceptions`,
                        post({ classId: pickClass[child.id], kind: 'add' }),
                        'Class added for this child',
                      );
                      if (ok) setPickClass({ ...pickClass, [child.id]: '' });
                    }}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {addingChild ? (
          <form
            className={styles.stack}
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await run(
                `/api/coops/${coopId}/families/${family.id}/children`,
                post(toChildInput(newChild)),
                `${newChild.name} added`,
              );
              if (ok) {
                setAddingChild(false);
                setNewChild(emptyChild());
              }
            }}
          >
            <ChildFields child={newChild} index={99} sections={sections} onChange={setNewChild} />
            <div className={base.buttonRow}>
              <button className={base.button} type="submit" disabled={busy}>
                Add child
              </button>
              <button
                className={base.quietButton}
                type="button"
                onClick={() => setAddingChild(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className={base.buttonRow}>
            <button className={base.quietButton} type="button" onClick={() => setAddingChild(true)}>
              <Plus aria-hidden="true" size={14} /> Add a child
            </button>
          </div>
        )}

        {confirmDelete ? (
          <div className={base.confirmBox} role="alert">
            <p className={base.confirmText}>
              Remove {family.parentName}’s family? Their children, classes, payments and volunteer
              hours are deleted. This can’t be undone.
            </p>
            <div className={base.buttonRow}>
              <button
                className={base.dangerButtonSolid}
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    `/api/coops/${coopId}/families/${family.id}`,
                    post({}, 'DELETE'),
                    'Family removed',
                  )
                }
              >
                Yes, remove family
              </button>
              <button
                className={base.quietButton}
                type="button"
                onClick={() => setConfirmDelete(false)}
              >
                Keep them
              </button>
            </div>
          </div>
        ) : (
          <div className={base.buttonRow}>
            <button
              className={base.dangerButton}
              type="button"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 aria-hidden="true" size={14} /> Remove family
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

export function useFamilyOverview(coopId: string) {
  const [overview, setOverview] = useState<FamilyOverviewType | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try {
      setOverview(await apiFetch(`/api/coops/${coopId}/families`, { schema: FamilyOverview }));
    } catch {
      setError(true);
    }
  }, [coopId]);
  useEffect(() => {
    void load();
  }, [load]);
  return { overview, setOverview, error, reload: load };
}

export function LoadState({ error, onRetry }: { error: boolean; onRetry: () => void }) {
  return error ? (
    <section className={base.errorState} role="alert">
      <p className={base.description}>We couldn’t load this part of the co-op.</p>
      <button className={base.button} type="button" onClick={onRetry}>
        Try again
      </button>
    </section>
  ) : (
    <output className={base.loading} aria-live="polite">
      Loading…
    </output>
  );
}

export function FamiliesPanel({ coopId, settings, onSettings }: Props) {
  const { overview, setOverview, error, reload } = useFamilyOverview(coopId);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  if (!overview) return <LoadState error={error} onRetry={() => void reload()} />;

  const sectionOptions = overview.sections.map((section) => ({
    id: section.id,
    name: section.name,
  }));
  const childCount = overview.families.reduce((sum, family) => sum + family.children.length, 0);
  const unplacedCount = overview.families.reduce(
    (sum, family) => sum + family.children.filter((child) => !child.sectionId).length,
    0,
  );
  const changedCount = overview.families.reduce(
    (sum, family) =>
      sum +
      family.children.filter(
        (child) => child.skipped.length || child.classes.some((item) => item.source === 'added'),
      ).length,
    0,
  );
  const search = query.trim().toLowerCase();
  const families = search
    ? overview.families.filter((family) =>
        [family.parentName, family.email, ...family.children.map((child) => child.name)]
          .join(' ')
          .toLowerCase()
          .includes(search),
      )
    : overview.families;

  function exportRoster() {
    if (!overview) return;
    const rows: (string | number | null)[][] = [
      ['Parent', 'Email', 'Phone', 'Child', 'Section', 'Class', 'Time', 'Note'],
    ];
    for (const family of overview.families) {
      for (const child of family.children) {
        const first = [
          family.parentName,
          family.email,
          family.phone,
          child.name,
          child.sectionName,
        ];
        if (!child.classes.length) {
          rows.push([...first, '', '', child.sectionId ? '' : 'Not placed yet']);
        }
        for (const item of child.classes) {
          rows.push([
            ...first,
            item.className,
            item.time,
            item.source === 'added' ? `From ${item.sectionName}` : '',
          ]);
        }
      }
    }
    downloadCsv('families-and-classes.csv', rows);
  }

  return (
    <div className={styles.stack}>
      <section className={styles.howItWorks} aria-labelledby="how-heading">
        <h2 className={base.panelTitle} id="how-heading">
          How families and classes work
        </h2>
        <ol className={styles.steps}>
          <li>
            <strong>Families sign up.</strong> Share your family link. While registration is open,
            parents enter their name, email, and each child’s name and grade. You can also add a
            family yourself.
          </li>
          <li>
            <strong>You place each child in a grade section.</strong> In Section placement, pick a
            section and select everyone who signed up for it, or tick children one by one. A child
            in a section takes that section’s whole schedule.
          </li>
          <li>
            <strong>Make exceptions one class at a time.</strong> Open a family below to have a
            child skip one of their section’s classes, or take a single class from another section.
          </li>
        </ol>
      </section>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{overview.families.length}</span>
          <span className={styles.statLabel}>Families</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{unplacedCount}</span>
          <span className={styles.statLabel}>Children not placed yet</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{childCount}</span>
          <span className={styles.statLabel}>Children</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{changedCount}</span>
          <span className={styles.statLabel}>With class changes</span>
        </div>
      </div>

      <div className={styles.grid2}>
        <RegistrationCard
          key={coopId}
          coopId={coopId}
          settings={settings}
          onSettings={onSettings}
        />
        <FamilyLinkCard coopId={coopId} settings={settings} onSettings={onSettings} />
      </div>

      <PlacementPanel
        coopId={coopId}
        overview={overview}
        onOverview={setOverview}
        reload={reload}
      />

      <section className={base.panel} aria-labelledby="families-heading">
        <div className={base.panelHeader}>
          <h2 className={base.panelTitle} id="families-heading">
            Families
          </h2>
          <div className={base.buttonRow}>
            <button
              className={base.quietButton}
              type="button"
              onClick={exportRoster}
              disabled={!overview.families.length}
            >
              <Download aria-hidden="true" size={14} /> Download spreadsheet
            </button>
            <button
              className={base.button}
              type="button"
              onClick={() => setAdding((open) => !open)}
            >
              <UserPlus aria-hidden="true" size={15} /> Add a family
            </button>
          </div>
        </div>
        <div className={styles.stack}>
          {adding && (
            <AddFamilyForm
              coopId={coopId}
              sections={sectionOptions}
              onDone={(next) => {
                setOverview(next);
                setAdding(false);
              }}
            />
          )}
          {overview.families.length > 6 && (
            <input
              className={base.field}
              type="search"
              placeholder="Search families or children"
              aria-label="Search families or children"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}
          {families.length ? (
            families.map((family) => (
              <FamilyDetails
                key={family.id}
                coopId={coopId}
                family={family}
                sections={overview.sections}
                onOverview={setOverview}
              />
            ))
          ) : (
            <p className={base.muted}>
              {overview.families.length
                ? 'No families match that search.'
                : 'No families yet. Open registration and share the family link, or add a family yourself.'}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
