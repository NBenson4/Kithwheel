// Families tab: registration, class rosters with waitlists, and each family's details.
'use client';

import { Download, Mail, Plus, Trash2, UserPlus } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import styles from '@/components/custom/coop/coop.module.css';
import { FamilyLinkCard } from '@/components/custom/coop/settings-panel';
import { copyText, downloadCsv, errorMessage, post } from '@/components/custom/coop/shared';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import {
  type ClassRoster,
  CoopSettings,
  type CoopSettings as CoopSettingsType,
  FamilyOverview,
  type FamilyOverview as FamilyOverviewType,
  type FamilyRecord,
} from '@/lib/contracts/coop-features';

type Props = {
  coopId: string;
  settings: CoopSettingsType;
  onSettings: (settings: CoopSettingsType) => void;
};

type ChildDraft = { name: string; ageGroup: string; classIds: string[] };
const emptyChild = (): ChildDraft => ({ name: '', ageGroup: '', classIds: [] });

function seatsLabel(item: ClassRoster) {
  const seats =
    item.capacity === null
      ? `${item.enrolled} enrolled`
      : `${item.enrolled} of ${item.capacity} seats`;
  return item.waitlisted ? `${seats} · ${item.waitlisted} waiting` : seats;
}

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
          When registration is open, the family link shows a sign-up form. Families choose classes
          for each child from the published schedule; full classes go to a waitlist, and families
          are emailed when a seat opens.
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

function ChildFields({
  child,
  index,
  classes,
  onChange,
  onRemove,
}: {
  child: ChildDraft;
  index: number;
  classes: { id: string; name: string }[];
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
        <label className={base.smallLabel} htmlFor={`child-age-${index}`}>
          Age group (optional)
          <input
            id={`child-age-${index}`}
            className={base.field}
            value={child.ageGroup}
            maxLength={80}
            onChange={(event) => onChange({ ...child, ageGroup: event.target.value })}
          />
        </label>
      </div>
      {classes.length > 0 && (
        <fieldset className={styles.stack} style={{ border: 0, margin: 0, padding: 0, gap: 6 }}>
          <legend className={base.fieldLabel}>Classes</legend>
          <div className={styles.grid2} style={{ gap: 6 }}>
            {classes.map((item) => (
              <label className={styles.checkRow} key={item.id}>
                <input
                  type="checkbox"
                  checked={child.classIds.includes(item.id)}
                  onChange={(event) =>
                    onChange({
                      ...child,
                      classIds: event.target.checked
                        ? [...child.classIds, item.id]
                        : child.classIds.filter((id) => id !== item.id),
                    })
                  }
                />
                {item.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
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
  classes,
  onDone,
}: {
  coopId: string;
  classes: { id: string; name: string }[];
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
        ...post({ parentName, email, phone, children, sendEmail }),
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
          classes={classes}
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
  classes,
  onOverview,
}: {
  coopId: string;
  family: FamilyRecord;
  classes: { id: string; name: string }[];
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
        <span className={styles.pill}>
          {childCount} {childCount === 1 ? 'child' : 'children'}
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
          const taken = new Set(child.enrollments.map((entry) => entry.classId));
          const options = classes.filter((item) => !taken.has(item.id));
          return (
            <div className={styles.childCard} key={child.id}>
              <span className={styles.rowTitle}>
                {child.name}
                {child.ageGroup ? <span className={base.muted}> · {child.ageGroup}</span> : null}
              </span>
              {child.enrollments.length ? (
                <ul className={styles.list}>
                  {child.enrollments.map((entry) => (
                    <li className={styles.row} key={entry.id}>
                      <span className={styles.rowTitle}>{entry.className}</span>
                      <span className={styles.rowActions}>
                        <span
                          className={`${styles.pill} ${entry.status === 'enrolled' ? styles.pillGood : styles.pillWarn}`}
                        >
                          {entry.status === 'enrolled' ? 'Enrolled' : 'Waitlist'}
                        </span>
                        {entry.status === 'waitlisted' && (
                          <button
                            className={styles.chipButton}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                `/api/coops/${coopId}/enrollments/${entry.id}`,
                                post({ status: 'enrolled' }, 'PATCH'),
                                `${child.name} enrolled in ${entry.className}`,
                              )
                            }
                          >
                            Enroll anyway
                          </button>
                        )}
                        <button
                          className={styles.chipButton}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              `/api/coops/${coopId}/enrollments/${entry.id}`,
                              post({}, 'DELETE'),
                              `${child.name} removed from ${entry.className}`,
                            )
                          }
                        >
                          Remove
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={base.muted}>No classes yet.</p>
              )}
              {options.length > 0 && (
                <div className={base.buttonRow}>
                  <select
                    className={base.select}
                    aria-label={`Add a class for ${child.name}`}
                    value={pickClass[child.id] ?? ''}
                    onChange={(event) =>
                      setPickClass({ ...pickClass, [child.id]: event.target.value })
                    }
                  >
                    <option value="">Add a class…</option>
                    {options.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className={base.quietButton}
                    type="button"
                    disabled={busy || !pickClass[child.id]}
                    onClick={async () => {
                      const ok = await run(
                        `/api/coops/${coopId}/enrollments`,
                        post({ childId: child.id, classId: pickClass[child.id] }),
                        'Class added',
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
                post(newChild),
                `${newChild.name} added`,
              );
              if (ok) {
                setAddingChild(false);
                setNewChild(emptyChild());
              }
            }}
          >
            <ChildFields child={newChild} index={99} classes={classes} onChange={setNewChild} />
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
              hours are deleted, and their seats go to the waitlist. This can’t be undone.
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

  const classes = overview.classes.map((item) => ({ id: item.id, name: item.name }));
  const childCount = overview.families.reduce((sum, family) => sum + family.children.length, 0);
  const waiting = overview.classes.reduce((sum, item) => sum + item.waitlisted, 0);
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
      ['Parent', 'Email', 'Phone', 'Child', 'Age group', 'Class', 'Status'],
    ];
    for (const family of overview.families) {
      for (const child of family.children) {
        if (!child.enrollments.length) {
          rows.push([
            family.parentName,
            family.email,
            family.phone,
            child.name,
            child.ageGroup,
            '',
            '',
          ]);
        }
        for (const entry of child.enrollments) {
          rows.push([
            family.parentName,
            family.email,
            family.phone,
            child.name,
            child.ageGroup,
            entry.className,
            entry.status === 'enrolled' ? 'Enrolled' : 'Waitlist',
          ]);
        }
      }
    }
    downloadCsv('families-and-classes.csv', rows);
  }

  return (
    <div className={styles.stack}>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{overview.families.length}</span>
          <span className={styles.statLabel}>Families</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{childCount}</span>
          <span className={styles.statLabel}>Children</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{waiting}</span>
          <span className={styles.statLabel}>On waitlists</span>
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

      <section className={base.panel} aria-labelledby="rosters-heading">
        <div className={base.panelHeader}>
          <h2 className={base.panelTitle} id="rosters-heading">
            Class rosters
          </h2>
          <span className={base.count}>{overview.classes.length}</span>
        </div>
        {overview.classes.length ? (
          <div className={styles.stack} style={{ gap: 8 }}>
            {overview.classes.map((item) => (
              <details className={styles.details} key={item.id}>
                <summary>
                  <span className={styles.rowTitle}>{item.name}</span>
                  <span
                    className={`${styles.pill} ${item.capacity !== null && item.enrolled >= item.capacity ? styles.pillWarn : ''}`}
                  >
                    {seatsLabel(item)}
                  </span>
                </summary>
                <div className={styles.detailsBody}>
                  {item.roster.length ? (
                    <ol className={styles.list}>
                      {item.roster.map((entry) => (
                        <li className={styles.row} key={entry.enrollmentId}>
                          <span className={styles.rowMain}>
                            <span className={styles.rowTitle}>{entry.childName}</span>
                            <span className={styles.rowMeta}>{entry.familyName}</span>
                          </span>
                          <span
                            className={`${styles.pill} ${entry.status === 'enrolled' ? styles.pillGood : styles.pillWarn}`}
                          >
                            {entry.status === 'enrolled' ? 'Enrolled' : 'Waitlist'}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className={base.muted}>No one has signed up yet.</p>
                  )}
                  <p className={base.muted}>
                    Change capacity on the Schedule tab’s class library. Raising it moves waitlisted
                    children in automatically.
                  </p>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className={base.muted}>Add classes on the Schedule tab first.</p>
        )}
      </section>

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
              classes={classes}
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
                classes={classes}
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
