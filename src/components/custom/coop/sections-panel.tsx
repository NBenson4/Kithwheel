// Schedules tab: one schedule per grade section. Coordinators add classes to a section,
// put them in order, and approve the schedule so families can see it.
'use client';

import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileUp,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { ClassImport } from '@/components/custom/coop/class-import';
import styles from '@/components/custom/coop/coop.module.css';
import { errorMessage, post } from '@/components/custom/coop/shared';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import {
  type CoopClassRecord,
  CoopClassRecord as CoopClassSchema,
  DeletedRecord,
  SectionList,
  type SectionList as SectionListType,
  type SectionRecord,
} from '@/lib/contracts/coops';
import { centsToDollarInput, dollarsToCents, formatMoney } from '@/lib/coop/money';

type Props = {
  coopId: string;
  sections: SectionListType;
  onSections: (sections: SectionListType) => void;
  /** Reload everything that depends on sections (settings counts, families). */
  onChanged: () => void;
};

type ClassDraft = {
  name: string;
  description: string;
  teacher: string;
  room: string;
  time: string;
  capacity: string;
  fee: string;
  materials: string;
  sectionId: string;
};

const emptyDraft = (sectionId: string): ClassDraft => ({
  name: '',
  description: '',
  teacher: '',
  room: '',
  time: '',
  capacity: '',
  fee: '',
  materials: '',
  sectionId,
});

function ClassForm({
  coopId,
  sections,
  editing,
  initial,
  onDone,
  onCancel,
}: {
  coopId: string;
  sections: SectionRecord[];
  editing: CoopClassRecord | null;
  initial: ClassDraft;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ClassDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const field = (key: keyof ClassDraft) => ({
    value: draft[key],
    onChange: (event: { target: { value: string } }) =>
      setDraft({ ...draft, [key]: event.target.value }),
  });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const capacity = draft.capacity.trim() === '' ? null : Number(draft.capacity);
    const feeCents = dollarsToCents(draft.fee);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
      toast.error('Seats need to be a whole number, or left empty for no limit.');
      return;
    }
    if (feeCents === null || feeCents < 0) {
      toast.error('Enter the class fee as a dollar amount, like 15 or 12.50.');
      return;
    }
    const { capacity: _capacity, fee: _fee, ...text } = draft;
    setSaving(true);
    try {
      await apiFetch(
        editing ? `/api/coops/${coopId}/classes/${editing.id}` : `/api/coops/${coopId}/classes`,
        {
          ...post({ ...text, capacity, feeCents }, editing ? 'PATCH' : 'POST'),
          schema: CoopClassSchema,
        },
      );
      toast.success(editing ? 'Class saved' : 'Class added');
      await onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setSaving(true);
    try {
      await apiFetch(`/api/coops/${coopId}/classes/${editing.id}`, {
        ...post({}, 'DELETE'),
        schema: DeletedRecord,
      });
      toast.success(`${editing.name} deleted`);
      await onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={base.inlineForm} onSubmit={save}>
      <strong className={styles.rowTitle}>{editing ? `Edit ${editing.name}` : 'New class'}</strong>
      <label className={base.smallLabel} htmlFor="class-name">
        Class name
        <input id="class-name" className={base.field} required maxLength={120} {...field('name')} />
      </label>
      <div className={base.optionalGrid}>
        <label className={base.smallLabel} htmlFor="class-time">
          Time (e.g. 9:00-9:50)
          <input id="class-time" className={base.field} maxLength={120} {...field('time')} />
        </label>
        <label className={base.smallLabel} htmlFor="class-teacher">
          Teacher
          <input id="class-teacher" className={base.field} maxLength={120} {...field('teacher')} />
        </label>
        <label className={base.smallLabel} htmlFor="class-room">
          Room
          <input id="class-room" className={base.field} maxLength={120} {...field('room')} />
        </label>
        <label className={base.smallLabel} htmlFor="class-fee">
          Class fee ($, optional)
          <input id="class-fee" className={base.field} inputMode="decimal" {...field('fee')} />
        </label>
        <label className={base.smallLabel} htmlFor="class-capacity">
          Seats (empty = no limit)
          <input
            id="class-capacity"
            className={base.field}
            inputMode="numeric"
            {...field('capacity')}
          />
        </label>
        <label className={base.smallLabel} htmlFor="class-section">
          Section
          <select id="class-section" className={base.select} {...field('sectionId')}>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={base.smallLabel} htmlFor="class-description">
        Description (optional)
        <input
          id="class-description"
          className={base.field}
          maxLength={500}
          {...field('description')}
        />
      </label>
      <label className={base.smallLabel} htmlFor="class-materials">
        Materials list (optional, shown to families)
        <textarea
          id="class-materials"
          className={styles.textarea}
          maxLength={1000}
          {...field('materials')}
        />
      </label>
      <div className={base.buttonRow}>
        <button className={base.button} type="submit" disabled={saving}>
          {editing ? 'Save class' : 'Add class'}
        </button>
        <button className={base.quietButton} type="button" onClick={onCancel}>
          Cancel
        </button>
        {editing && !confirmDelete && (
          <button
            className={base.dangerButton}
            type="button"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 aria-hidden="true" size={14} /> Delete class
          </button>
        )}
      </div>
      {editing && confirmDelete && (
        <div className={base.confirmBox} role="alert">
          <p className={base.confirmText}>
            Delete “{editing.name}”? It comes off this section’s schedule, and any child who was
            taking it from another section loses it too. This can’t be undone.
          </p>
          <div className={base.buttonRow}>
            <button
              className={base.dangerButtonSolid}
              type="button"
              disabled={saving}
              onClick={() => void remove()}
            >
              Yes, delete class
            </button>
            <button
              className={base.quietButton}
              type="button"
              onClick={() => setConfirmDelete(false)}
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

export function SectionsPanel({ coopId, sections, onSections, onChanged }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(sections.items[0]?.id ?? null);
  const [form, setForm] = useState<{ editing: CoopClassRecord | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newSection, setNewSection] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  const section =
    sections.items.find((item) => item.id === selectedId) ?? sections.items[0] ?? null;

  async function reload() {
    onSections(await apiFetch(`/api/coops/${coopId}/sections`, { schema: SectionList }));
    onChanged();
  }

  async function run(path: string, init: RequestInit, message: string) {
    setBusy(true);
    try {
      onSections(await apiFetch(path, { ...init, schema: SectionList }));
      onChanged();
      toast.success(message);
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function choose(id: string) {
    setSelectedId(id);
    setForm(null);
    setImporting(false);
    setRenaming(null);
    setConfirmRemove(false);
  }

  async function move(index: number, direction: -1 | 1) {
    if (!section) return;
    const ids = section.classes.map((item) => item.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    await run(
      `/api/coops/${coopId}/sections/${section.id}/order`,
      post({ classIds: ids }, 'PUT'),
      'Order saved',
    );
  }

  return (
    <div
      className={styles.placementLayout}
      style={{ gridTemplateColumns: 'minmax(220px, 300px) minmax(0, 1fr)' }}
    >
      <nav className={styles.stack} style={{ gap: 6 }} aria-label="Grade sections">
        <h2 className={styles.groupTitle} style={{ marginTop: 0 }}>
          Grade sections
        </h2>
        {sections.items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${styles.classPick} ${item.id === section?.id ? styles.classPickActive : ''}`}
            aria-pressed={item.id === section?.id}
            onClick={() => choose(item.id)}
          >
            <span className={styles.rowMain}>
              <span className={styles.rowTitle}>{item.name}</span>
              <span className={styles.rowMeta}>
                {item.classes.length} {item.classes.length === 1 ? 'class' : 'classes'} ·{' '}
                {item.childCount} {item.childCount === 1 ? 'child' : 'children'}
              </span>
            </span>
            <span className={`${styles.pill} ${item.status === 'approved' ? styles.pillGood : ''}`}>
              {item.status === 'approved' ? 'Approved' : 'Draft'}
            </span>
          </button>
        ))}
        <form
          className={base.inlineForm}
          onSubmit={async (event) => {
            event.preventDefault();
            const ok = await run(
              `/api/coops/${coopId}/sections`,
              post({ name: newSection }),
              `${newSection} added`,
            );
            if (ok) setNewSection('');
          }}
        >
          <label className={base.smallLabel} htmlFor="new-section">
            Add a section
            <input
              id="new-section"
              className={base.field}
              value={newSection}
              required
              maxLength={80}
              placeholder="e.g. 9th–12th grade"
              onChange={(event) => setNewSection(event.target.value)}
            />
          </label>
          <button className={base.quietButton} type="submit" disabled={busy}>
            <Plus aria-hidden="true" size={14} /> Add section
          </button>
        </form>
      </nav>

      {section ? (
        <section className={base.panel} aria-labelledby="section-heading">
          <div className={base.panelHeader} style={{ alignItems: 'flex-start' }}>
            <div>
              {renaming !== null ? (
                <form
                  className={base.buttonRow}
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const ok = await run(
                      `/api/coops/${coopId}/sections/${section.id}`,
                      post({ name: renaming }, 'PATCH'),
                      'Section renamed',
                    );
                    if (ok) setRenaming(null);
                  }}
                >
                  <input
                    className={base.field}
                    aria-label="Section name"
                    value={renaming}
                    required
                    maxLength={80}
                    onChange={(event) => setRenaming(event.target.value)}
                  />
                  <button className={base.button} type="submit" disabled={busy}>
                    Save
                  </button>
                  <button
                    className={base.quietButton}
                    type="button"
                    onClick={() => setRenaming(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <h2 className={styles.sectionTitle} id="section-heading" style={{ fontSize: 24 }}>
                  {section.name} schedule
                </h2>
              )}
              <p className={base.muted} style={{ margin: '6px 0 0' }}>
                {section.status === 'approved'
                  ? `Approved${section.approvedAt ? ` ${new Date(section.approvedAt).toLocaleDateString()}` : ''}. Families can see it.`
                  : 'Draft. Families can’t see it until you approve it.'}{' '}
                Every child in {section.name} takes these classes ({section.childCount}{' '}
                {section.childCount === 1 ? 'child' : 'children'} now).
              </p>
            </div>
            <div className={base.buttonRow}>
              {section.status === 'approved' ? (
                <button
                  className={base.quietButton}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      `/api/coops/${coopId}/sections/${section.id}`,
                      post({ status: 'draft' }, 'PATCH'),
                      `${section.name} is back to draft`,
                    )
                  }
                >
                  <RotateCcw aria-hidden="true" size={14} /> Return to draft
                </button>
              ) : (
                <button
                  className={base.button}
                  type="button"
                  disabled={busy || !section.classes.length}
                  onClick={() =>
                    void run(
                      `/api/coops/${coopId}/sections/${section.id}`,
                      post({ status: 'approved' }, 'PATCH'),
                      `${section.name} schedule approved`,
                    )
                  }
                >
                  <CheckCircle2 aria-hidden="true" size={15} /> Approve schedule
                </button>
              )}
            </div>
          </div>

          <div className={styles.stack}>
            {section.classes.length ? (
              <ol className={styles.list}>
                {section.classes.map((item, index) => (
                  <li className={styles.row} key={item.id}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{item.name}</span>
                      <span className={styles.rowMeta}>
                        {[item.time, item.teacher, item.room].filter(Boolean).join(' · ') ||
                          'No time or teacher yet'}
                        {item.feeCents ? ` · ${formatMoney(item.feeCents)}` : ''}
                        {item.capacity ? ` · ${item.capacity} seats` : ''}
                      </span>
                    </span>
                    <span className={styles.rowActions}>
                      <button
                        className={styles.chipButton}
                        type="button"
                        aria-label={`Move ${item.name} up`}
                        disabled={busy || index === 0}
                        onClick={() => void move(index, -1)}
                      >
                        <ArrowUp aria-hidden="true" size={13} />
                      </button>
                      <button
                        className={styles.chipButton}
                        type="button"
                        aria-label={`Move ${item.name} down`}
                        disabled={busy || index === section.classes.length - 1}
                        onClick={() => void move(index, 1)}
                      >
                        <ArrowDown aria-hidden="true" size={13} />
                      </button>
                      <button
                        className={styles.chipButton}
                        type="button"
                        aria-label={`Edit ${item.name}`}
                        onClick={() => {
                          setImporting(false);
                          setForm({ editing: item });
                        }}
                      >
                        <Pencil aria-hidden="true" size={13} /> Edit
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.note}>
                No classes in {section.name} yet. Add the first one below.
              </p>
            )}

            {form ? (
              <ClassForm
                key={form.editing?.id ?? `new-${section.id}`}
                coopId={coopId}
                sections={sections.items}
                editing={form.editing}
                initial={
                  form.editing
                    ? {
                        name: form.editing.name,
                        description: form.editing.description ?? '',
                        teacher: form.editing.teacher ?? '',
                        room: form.editing.room ?? '',
                        time: form.editing.time ?? '',
                        capacity: form.editing.capacity ? String(form.editing.capacity) : '',
                        fee: centsToDollarInput(form.editing.feeCents),
                        materials: form.editing.materials ?? '',
                        sectionId: form.editing.sectionId ?? section.id,
                      }
                    : emptyDraft(section.id)
                }
                onDone={async () => {
                  setForm(null);
                  await reload();
                }}
                onCancel={() => setForm(null)}
              />
            ) : (
              <div className={base.buttonRow}>
                <button
                  className={base.button}
                  type="button"
                  onClick={() => {
                    setImporting(false);
                    setForm({ editing: null });
                  }}
                >
                  <Plus aria-hidden="true" size={15} /> Add a class to {section.name}
                </button>
                <button
                  className={base.quietButton}
                  type="button"
                  onClick={() => setImporting((open) => !open)}
                >
                  <FileUp aria-hidden="true" size={15} /> Import from a spreadsheet
                </button>
              </div>
            )}
            {importing && (
              <ClassImport
                coopId={coopId}
                sectionId={section.id}
                sectionName={section.name}
                onImported={reload}
                onClose={() => setImporting(false)}
              />
            )}

            {sections.unfiledClasses.length > 0 && (
              <div className={styles.note}>
                <strong>Classes not in a section yet:</strong>{' '}
                {sections.unfiledClasses.map((item, index) => (
                  <span key={item.id}>
                    {index ? ', ' : ''}
                    <button
                      className={styles.chipButton}
                      type="button"
                      onClick={() => {
                        setImporting(false);
                        setForm({ editing: { ...item, sectionId: section.id } });
                      }}
                    >
                      {item.name}
                    </button>
                  </span>
                ))}
                . Open one to file it under {section.name} or another section.
              </div>
            )}

            <details className={styles.details}>
              <summary>
                <span className={styles.rowTitle}>Section settings</span>
              </summary>
              <div className={styles.detailsBody}>
                <div className={base.buttonRow}>
                  <button
                    className={base.quietButton}
                    type="button"
                    onClick={() => setRenaming(section.name)}
                  >
                    <Pencil aria-hidden="true" size={14} /> Rename
                  </button>
                  <button
                    className={base.quietButton}
                    type="button"
                    disabled={busy || sections.items[0]?.id === section.id}
                    onClick={() =>
                      void run(
                        `/api/coops/${coopId}/sections/${section.id}`,
                        post({ move: -1 }, 'PATCH'),
                        'Moved up',
                      )
                    }
                  >
                    <ArrowUp aria-hidden="true" size={14} /> Move up
                  </button>
                  <button
                    className={base.quietButton}
                    type="button"
                    disabled={busy || sections.items.at(-1)?.id === section.id}
                    onClick={() =>
                      void run(
                        `/api/coops/${coopId}/sections/${section.id}`,
                        post({ move: 1 }, 'PATCH'),
                        'Moved down',
                      )
                    }
                  >
                    <ArrowDown aria-hidden="true" size={14} /> Move down
                  </button>
                  {confirmRemove ? (
                    <>
                      <button
                        className={base.dangerButtonSolid}
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          const ok = await run(
                            `/api/coops/${coopId}/sections/${section.id}`,
                            post({}, 'DELETE'),
                            `${section.name} removed`,
                          );
                          setConfirmRemove(false);
                          if (ok) setSelectedId(null);
                        }}
                      >
                        Yes, remove {section.name}
                      </button>
                      <button
                        className={base.quietButton}
                        type="button"
                        onClick={() => setConfirmRemove(false)}
                      >
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button
                      className={base.dangerButton}
                      type="button"
                      onClick={() => setConfirmRemove(true)}
                    >
                      <Trash2 aria-hidden="true" size={14} /> Remove section
                    </button>
                  )}
                </div>
                <p className={base.muted} style={{ margin: 0 }}>
                  A section can be removed once it has no classes or children.
                </p>
              </div>
            </details>
          </div>
        </section>
      ) : (
        <p className={base.muted}>Add a section to start.</p>
      )}
    </div>
  );
}
