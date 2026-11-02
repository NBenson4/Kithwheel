// Kithwheel's co-op schedule desk.
'use client';

import { CalendarDays, Copy, FileUp, Plus, School, Trash2 } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BillingPanel } from '@/components/custom/billing/billing-panel';
import { AnnouncementsPanel } from '@/components/custom/coop/announcements-panel';
import { AttendancePanel } from '@/components/custom/coop/attendance-panel';
import { ClassImport } from '@/components/custom/coop/class-import';
import tabStyles from '@/components/custom/coop/coop.module.css';
import { FamiliesPanel } from '@/components/custom/coop/families-panel';
import { FeesPanel } from '@/components/custom/coop/fees-panel';
import { SettingsPanel } from '@/components/custom/coop/settings-panel';
import { SetupChecklist, type WorkspaceTab } from '@/components/custom/coop/setup-checklist';
import { errorMessage } from '@/components/custom/coop/shared';
import { VolunteerPanel } from '@/components/custom/coop/volunteer-panel';
import { ScheduleEditor } from '@/components/custom/scheduling/schedule-editor';
import styles from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import { CoopSettings, type CoopSettings as CoopSettingsType } from '@/lib/contracts/coop-features';
import {
  type CoopRecord as Coop,
  type CoopClassRecord as CoopClass,
  CoopClassList,
  CoopClassRecord,
  CoopList,
  CoopRecord,
  DeletedRecord,
  ScheduleList,
  type ScheduleRecord,
} from '@/lib/contracts/coops';
import { centsToDollarInput, dollarsToCents } from '@/lib/coop/money';

type ClassDraft = {
  name: string;
  description: string;
  teacher: string;
  room: string;
  time: string;
  capacity: string;
  fee: string;
  materials: string;
};

const emptyClass: ClassDraft = {
  name: '',
  description: '',
  teacher: '',
  room: '',
  time: '',
  capacity: '',
  fee: '',
  materials: '',
};

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'families', label: 'Families' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'volunteer', label: 'Volunteer hours' },
  { id: 'fees', label: 'Fees' },
  { id: 'settings', label: 'Settings & team' },
];

function initialTab(): WorkspaceTab {
  if (typeof window === 'undefined') return 'schedule';
  const requested = new URL(window.location.href).searchParams.get('tab');
  return TABS.some((tab) => tab.id === requested) ? (requested as WorkspaceTab) : 'schedule';
}

export function CoordinatorWorkspace() {
  const [coops, setCoops] = useState<Coop[]>([]);
  const [coopId, setCoopId] = useState('');
  const [classes, setClasses] = useState<CoopClass[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [currentScheduleId, setCurrentScheduleId] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingCoopData, setLoadingCoopData] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [coopDataError, setCoopDataError] = useState(false);
  const [creatingCoop, setCreatingCoop] = useState(false);
  const [coopName, setCoopName] = useState('');
  const [scheduleName, setScheduleName] = useState('');
  const [classFormOpen, setClassFormOpen] = useState(false);
  const [classDraft, setClassDraft] = useState<ClassDraft>(emptyClass);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settings, setSettings] = useState<CoopSettingsType | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('schedule');
  const [importOpen, setImportOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    setTab(initialTab());
  }, []);

  function goTo(next: WorkspaceTab) {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.replaceState(null, '', url);
    } catch {
      // The tab still switches; only the address bar isn't updated.
    }
  }

  const loadCoops = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await apiFetch('/api/coops', { schema: CoopList });
      setCoops(result.items);
      // A ?coop= marker (returning from Stripe) selects that co-op.
      const requested = new URL(window.location.href).searchParams.get('coop');
      setCoopId((current) => {
        if (requested && result.items.some((coop) => coop.id === requested)) return requested;
        return result.items.some((coop) => coop.id === current)
          ? current
          : (result.items[0]?.id ?? '');
      });
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCoops();
  }, [loadCoops]);

  const refreshCoopData = useCallback(async (selectedCoopId: string) => {
    setLoadingCoopData(true);
    setCoopDataError(false);
    try {
      const [classResult, scheduleResult, settingsResult] = await Promise.all([
        apiFetch(`/api/coops/${selectedCoopId}/classes`, { schema: CoopClassList }),
        apiFetch(`/api/coops/${selectedCoopId}/schedules`, { schema: ScheduleList }),
        apiFetch(`/api/coops/${selectedCoopId}/settings`, { schema: CoopSettings }),
      ]);
      setClasses(classResult.items);
      setSettings(settingsResult);
      setSchedules(scheduleResult.items);
      setCurrentScheduleId(scheduleResult.currentScheduleId);
      setSelectedScheduleId((current) =>
        scheduleResult.items.some((schedule) => schedule.id === current)
          ? current
          : (scheduleResult.items[0]?.id ?? null),
      );
    } catch {
      setClasses([]);
      setSchedules([]);
      setCurrentScheduleId(null);
      setSettings(null);
      setCoopDataError(true);
    } finally {
      setLoadingCoopData(false);
    }
  }, []);

  useEffect(() => {
    if (coopId) void refreshCoopData(coopId);
    else {
      setClasses([]);
      setSchedules([]);
      setCurrentScheduleId(null);
      setSelectedScheduleId(null);
    }
  }, [coopId, refreshCoopData]);

  const refreshCurrentCoop = useCallback(async () => {
    if (coopId) await refreshCoopData(coopId);
  }, [coopId, refreshCoopData]);

  async function createCoop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const created = await apiFetch('/api/coops', {
        method: 'POST',
        body: JSON.stringify({ name: coopName }),
        schema: CoopRecord,
      });
      setCoops((current) => [...current, created]);
      setCoopId(created.id);
      setCoopName('');
      toast.success('Co-op created');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!coopId) return;
    try {
      const result = await apiFetch(`/api/coops/${coopId}/schedules`, {
        method: 'POST',
        body: JSON.stringify({ title: scheduleName }),
        schema: ScheduleList,
      });
      setSchedules(result.items);
      setSelectedScheduleId(result.items[0]?.id ?? null);
      setScheduleName('');
      toast.success('Draft created');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function copySchedule(schedule: ScheduleRecord) {
    if (!coopId) return;
    setCopying(true);
    try {
      const result = await apiFetch(`/api/coops/${coopId}/schedules/${schedule.id}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({}),
        schema: ScheduleList,
      });
      setSchedules(result.items);
      setSelectedScheduleId(result.items[0]?.id ?? null);
      toast.success(`Copied “${schedule.title}” into a new draft`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCopying(false);
    }
  }

  function startClassEdit(item: CoopClass) {
    setConfirmingDelete(false);
    setEditingClassId(item.id);
    setClassDraft({
      name: item.name,
      description: item.description ?? '',
      teacher: item.teacher ?? '',
      room: item.room ?? '',
      time: item.time ?? '',
      capacity: item.capacity ? String(item.capacity) : '',
      fee: centsToDollarInput(item.feeCents),
      materials: item.materials ?? '',
    });
    setClassFormOpen(true);
  }

  async function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!coopId) return;
    const path = editingClassId
      ? `/api/coops/${coopId}/classes/${editingClassId}`
      : `/api/coops/${coopId}/classes`;
    const capacity = classDraft.capacity.trim() === '' ? null : Number(classDraft.capacity);
    const feeCents = dollarsToCents(classDraft.fee);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
      toast.error('Capacity needs to be a whole number of seats, or left empty for no limit.');
      return;
    }
    if (feeCents === null || feeCents < 0) {
      toast.error('Enter the class fee as a dollar amount, like 15 or 12.50.');
      return;
    }
    const { capacity: _capacity, fee: _fee, ...text } = classDraft;
    try {
      await apiFetch(path, {
        method: editingClassId ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...text, capacity, feeCents }),
        schema: CoopClassRecord,
      });
      setClassDraft(emptyClass);
      setClassFormOpen(false);
      setEditingClassId(null);
      await refreshCurrentCoop();
      toast.success(editingClassId ? 'Class details saved' : 'Class added');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function deleteClass() {
    if (!coopId || !editingClassId) return;
    const name = classes.find((item) => item.id === editingClassId)?.name ?? 'Class';
    setDeleting(true);
    try {
      await apiFetch(`/api/coops/${coopId}/classes/${editingClassId}`, {
        method: 'DELETE',
        body: JSON.stringify({}),
        schema: DeletedRecord,
      });
      setClassDraft(emptyClass);
      setClassFormOpen(false);
      setEditingClassId(null);
      setConfirmingDelete(false);
      await refreshCurrentCoop();
      toast.success(`${name} deleted`);
    } catch (error) {
      setConfirmingDelete(false);
      toast.error(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  const draftsUsingEditingClass = editingClassId
    ? schedules.filter(
        (schedule) =>
          schedule.status !== 'published' &&
          schedule.rotations.some((rotation) =>
            rotation.entries.some((entry) => entry.class.id === editingClassId),
          ),
      ).length
    : 0;

  const currentSchedule = schedules.find((schedule) => schedule.id === currentScheduleId) ?? null;
  const selectedSchedule = schedules.find((schedule) => schedule.id === selectedScheduleId) ?? null;

  if (loading) {
    return (
      <output className={styles.loading} aria-live="polite">
        Opening your co-op workspace…
      </output>
    );
  }

  if (loadError) {
    return (
      <section className={styles.errorState} role="alert">
        <h1 className={styles.emptyTitle}>We couldn’t open your workspace</h1>
        <p className={styles.description}>Check your connection and try again.</p>
        <button className={styles.button} type="button" onClick={() => void loadCoops()}>
          Try again
        </button>
      </section>
    );
  }

  return (
    <div className={styles.workspace}>
      <header className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>Kithwheel · Coordinator workspace</p>
          <h1 className={styles.title}>Co-op workspace</h1>
          <p className={styles.description}>
            Schedules, families and registration, morning check-in, announcements, volunteer hours
            and fees for your co-op, in one place.
          </p>
        </div>
      </header>

      {!coops.length ? (
        <section className={styles.emptyState}>
          <School aria-hidden="true" size={22} color="var(--primary)" />
          <h2 className={styles.emptyTitle}>Start with your co-op</h2>
          <p className={styles.description}>
            Create a co-op workspace. You will be its first coordinator.
          </p>
          <form className={styles.inlineForm} onSubmit={createCoop}>
            <label className={styles.smallLabel} htmlFor="coop-name">
              Co-op name
              <input
                id="coop-name"
                className={styles.field}
                value={coopName}
                onChange={(event) => setCoopName(event.target.value)}
                required
                maxLength={120}
              />
            </label>
            <button className={styles.button} type="submit">
              Create co-op
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className={styles.coopBar} aria-label="Selected co-op">
            <label className={styles.coopSelect} htmlFor="selected-coop">
              <span className={styles.fieldLabel}>Co-op</span>
              <select
                id="selected-coop"
                className={styles.select}
                value={coopId}
                onChange={(event) => setCoopId(event.target.value)}
              >
                {coops.map((coop) => (
                  <option key={coop.id} value={coop.id}>
                    {coop.name}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.buttonRow}>
              <button
                className={styles.quietButton}
                type="button"
                onClick={() => setCreatingCoop((open) => !open)}
              >
                <Plus aria-hidden="true" size={15} /> Add co-op
              </button>
              {creatingCoop && (
                <form
                  className={styles.buttonRow}
                  onSubmit={async (event) => {
                    await createCoop(event);
                    setCreatingCoop(false);
                  }}
                >
                  <label className={styles.smallLabel} htmlFor="another-coop-name">
                    Co-op name
                    <input
                      id="another-coop-name"
                      className={styles.field}
                      value={coopName}
                      onChange={(event) => setCoopName(event.target.value)}
                      required
                      maxLength={120}
                    />
                  </label>
                  <button className={styles.button} type="submit">
                    Create
                  </button>
                </form>
              )}
            </div>
          </section>

          <section className={styles.currentBar} aria-label="Current schedule">
            <span className={styles.currentMark}>Current</span>
            <div className={styles.currentContent}>
              {currentSchedule ? (
                <>
                  <strong className={styles.currentTitle}>{currentSchedule.title}</strong>
                  <span className={styles.currentDetail}>
                    {currentSchedule.rotations.length}{' '}
                    {currentSchedule.rotations.length === 1
                      ? 'age-group rotation'
                      : 'age-group rotations'}{' '}
                    for {coops.find((coop) => coop.id === coopId)?.name}
                  </span>
                </>
              ) : (
                <span className={styles.currentDetail}>No schedule is current for this co-op.</span>
              )}
            </div>
          </section>

          {/* Hidden while the co-op's records can't load; the error below has its own retry. */}
          {coopId && !coopDataError && <BillingPanel key={coopId} coopId={coopId} />}

          {loadingCoopData ? (
            <output className={styles.loading} aria-live="polite">
              Loading this co-op&apos;s records…
            </output>
          ) : coopDataError ? (
            <section className={styles.errorState} role="alert">
              <p className={styles.description}>
                We couldn’t load this co-op&apos;s records. Your workspace is still available.
              </p>
              <button
                className={styles.button}
                type="button"
                onClick={() => void refreshCurrentCoop()}
              >
                Try again
              </button>
            </section>
          ) : (
            <>
              {settings && (
                <SetupChecklist
                  coopId={coopId}
                  settings={settings}
                  scheduleCount={schedules.length}
                  onGo={goTo}
                />
              )}
              <nav className={tabStyles.tabs} aria-label="Co-op workspace sections">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${tabStyles.tab} ${tab === item.id ? tabStyles.tabActive : ''}`}
                    aria-current={tab === item.id ? 'page' : undefined}
                    onClick={() => goTo(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              {tab !== 'schedule' && !settings ? (
                <output className={styles.loading} aria-live="polite">
                  Loading…
                </output>
              ) : tab !== 'schedule' && settings ? (
                <>
                  {tab === 'families' && (
                    <FamiliesPanel
                      key={coopId}
                      coopId={coopId}
                      settings={settings}
                      onSettings={setSettings}
                    />
                  )}
                  {tab === 'checkin' && (
                    <AttendancePanel
                      key={coopId}
                      coopId={coopId}
                      settings={settings}
                      onSettings={setSettings}
                    />
                  )}
                  {tab === 'announcements' && (
                    <AnnouncementsPanel key={coopId} coopId={coopId} classes={classes} />
                  )}
                  {tab === 'volunteer' && (
                    <VolunteerPanel
                      key={coopId}
                      coopId={coopId}
                      settings={settings}
                      onSettings={setSettings}
                    />
                  )}
                  {tab === 'fees' && (
                    <FeesPanel
                      key={coopId}
                      coopId={coopId}
                      settings={settings}
                      onSettings={setSettings}
                    />
                  )}
                  {tab === 'settings' && (
                    <SettingsPanel
                      key={coopId}
                      coopId={coopId}
                      settings={settings}
                      onSettings={setSettings}
                      onLeft={() => {
                        goTo('schedule');
                        void loadCoops();
                      }}
                    />
                  )}
                </>
              ) : (
                <div className={styles.columns}>
                  <aside className={styles.leftColumn} aria-label="Co-op records">
                    <section className={styles.panel} aria-labelledby="schedules-heading">
                      <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle} id="schedules-heading">
                          Schedules
                        </h2>
                        <span className={styles.count}>{schedules.length}</span>
                      </div>
                      {schedules.length ? (
                        <ul className={styles.scheduleList} aria-label="Schedule list">
                          {schedules.map((schedule) => (
                            <li key={schedule.id}>
                              <button
                                className={`${styles.scheduleChoice} ${selectedScheduleId === schedule.id ? styles.scheduleChoiceActive : ''}`}
                                type="button"
                                aria-pressed={selectedScheduleId === schedule.id}
                                onClick={() => setSelectedScheduleId(schedule.id)}
                              >
                                <span className={styles.scheduleRow}>
                                  <span className={styles.scheduleName}>{schedule.title}</span>
                                  <span
                                    className={`${styles.status} ${schedule.status === 'published' ? styles.statusPublished : ''} ${schedule.status === 'withdrawn' ? styles.statusWithdrawn : ''}`}
                                  >
                                    {schedule.status === 'archived' ? 'Replaced' : schedule.status}
                                  </span>
                                </span>
                                <span className={styles.scheduleMeta}>
                                  {schedule.rotations.length}{' '}
                                  {schedule.rotations.length === 1 ? 'rotation' : 'rotations'}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className={styles.muted}>No schedules yet.</p>
                      )}
                      <form className={styles.inlineForm} onSubmit={createSchedule}>
                        <label className={styles.smallLabel} htmlFor="schedule-name">
                          Schedule name
                          <input
                            id="schedule-name"
                            className={styles.field}
                            value={scheduleName}
                            onChange={(event) => setScheduleName(event.target.value)}
                            placeholder="Name supplied by your co-op"
                            required
                            maxLength={120}
                          />
                        </label>
                        <button className={styles.button} type="submit" disabled={!classes.length}>
                          <CalendarDays aria-hidden="true" size={15} /> Create draft
                        </button>
                        {!classes.length && (
                          <span className={styles.muted}>
                            Add a class before creating a schedule.
                          </span>
                        )}
                      </form>
                      {selectedSchedule && (
                        <button
                          className={`${styles.quietButton} ${styles.addClassButton}`}
                          type="button"
                          disabled={copying}
                          onClick={() => void copySchedule(selectedSchedule)}
                        >
                          <Copy aria-hidden="true" size={14} /> Copy “{selectedSchedule.title}” to a
                          new draft
                        </button>
                      )}
                    </section>

                    <section className={styles.classPanel} aria-labelledby="classes-heading">
                      <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle} id="classes-heading">
                          Class library
                        </h2>
                        <span className={styles.count}>{classes.length}</span>
                      </div>
                      {classes.length ? (
                        <div className={styles.classList}>
                          {classes.map((item) => (
                            <button
                              className={styles.classChoice}
                              key={item.id}
                              type="button"
                              onClick={() => startClassEdit(item)}
                              aria-label={`Edit ${item.name}`}
                            >
                              <span className={styles.classRow}>
                                <span className={styles.className}>{item.name}</span>
                                <span className={styles.muted}>Edit</span>
                              </span>
                              {(item.teacher || item.room || item.time) && (
                                <span className={styles.classMeta}>
                                  {[item.teacher, item.room, item.time].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className={styles.muted}>
                          Add only the class details your co-op has provided.
                        </p>
                      )}
                      <button
                        type="button"
                        className={`${styles.quietButton} ${styles.addClassButton}`}
                        onClick={() => {
                          setEditingClassId(null);
                          setConfirmingDelete(false);
                          setClassDraft(emptyClass);
                          setClassFormOpen((open) => !open);
                        }}
                      >
                        <Plus aria-hidden="true" size={15} /> Add a class
                      </button>
                      <button
                        type="button"
                        className={`${styles.quietButton} ${styles.addClassButton}`}
                        onClick={() => setImportOpen((open) => !open)}
                      >
                        <FileUp aria-hidden="true" size={15} /> Import from a spreadsheet
                      </button>
                      {importOpen && (
                        <ClassImport
                          coopId={coopId}
                          onImported={refreshCurrentCoop}
                          onClose={() => setImportOpen(false)}
                        />
                      )}
                      {classFormOpen && (
                        <form className={styles.inlineForm} onSubmit={saveClass}>
                          <label className={styles.smallLabel} htmlFor="class-name">
                            Class name
                            <input
                              id="class-name"
                              className={styles.field}
                              value={classDraft.name}
                              onChange={(event) =>
                                setClassDraft({ ...classDraft, name: event.target.value })
                              }
                              required
                              maxLength={120}
                            />
                          </label>
                          <label className={styles.smallLabel} htmlFor="class-description">
                            Description (optional)
                            <input
                              id="class-description"
                              className={styles.field}
                              value={classDraft.description}
                              onChange={(event) =>
                                setClassDraft({ ...classDraft, description: event.target.value })
                              }
                              maxLength={500}
                            />
                          </label>
                          <div className={styles.optionalGrid}>
                            <label className={styles.smallLabel} htmlFor="class-teacher">
                              Teacher, if supplied
                              <input
                                id="class-teacher"
                                className={styles.field}
                                value={classDraft.teacher}
                                onChange={(event) =>
                                  setClassDraft({ ...classDraft, teacher: event.target.value })
                                }
                                maxLength={120}
                              />
                            </label>
                            <label className={styles.smallLabel} htmlFor="class-room">
                              Room, if supplied
                              <input
                                id="class-room"
                                className={styles.field}
                                value={classDraft.room}
                                onChange={(event) =>
                                  setClassDraft({ ...classDraft, room: event.target.value })
                                }
                                maxLength={120}
                              />
                            </label>
                            <label className={styles.smallLabel} htmlFor="class-time">
                              Time, if supplied
                              <input
                                id="class-time"
                                className={styles.field}
                                value={classDraft.time}
                                onChange={(event) =>
                                  setClassDraft({ ...classDraft, time: event.target.value })
                                }
                                maxLength={120}
                              />
                            </label>
                            <label className={styles.smallLabel} htmlFor="class-capacity">
                              Seats (empty = no limit)
                              <input
                                id="class-capacity"
                                className={styles.field}
                                inputMode="numeric"
                                value={classDraft.capacity}
                                onChange={(event) =>
                                  setClassDraft({ ...classDraft, capacity: event.target.value })
                                }
                              />
                            </label>
                            <label className={styles.smallLabel} htmlFor="class-fee">
                              Class fee ($, optional)
                              <input
                                id="class-fee"
                                className={styles.field}
                                inputMode="decimal"
                                value={classDraft.fee}
                                onChange={(event) =>
                                  setClassDraft({ ...classDraft, fee: event.target.value })
                                }
                              />
                            </label>
                          </div>
                          <label className={styles.smallLabel} htmlFor="class-materials">
                            Materials list (optional, shown to families)
                            <textarea
                              id="class-materials"
                              className={styles.field}
                              style={{ minHeight: 64, paddingTop: 8 }}
                              value={classDraft.materials}
                              onChange={(event) =>
                                setClassDraft({ ...classDraft, materials: event.target.value })
                              }
                              maxLength={1000}
                            />
                          </label>
                          <div className={styles.buttonRow}>
                            <button className={styles.button} type="submit">
                              {editingClassId ? 'Save class details' : 'Create class'}
                            </button>
                            <button
                              className={styles.quietButton}
                              type="button"
                              onClick={() => {
                                setClassFormOpen(false);
                                setEditingClassId(null);
                                setConfirmingDelete(false);
                                setClassDraft(emptyClass);
                              }}
                            >
                              Cancel
                            </button>
                            {editingClassId && !confirmingDelete && (
                              <button
                                className={styles.dangerButton}
                                type="button"
                                onClick={() => setConfirmingDelete(true)}
                              >
                                <Trash2 aria-hidden="true" size={14} /> Delete class
                              </button>
                            )}
                          </div>
                          {editingClassId && confirmingDelete && (
                            <div className={styles.confirmBox} role="alert">
                              <p className={styles.confirmText}>
                                Delete “{classDraft.name || 'this class'}”? This can’t be undone.
                                {draftsUsingEditingClass > 0 &&
                                  ` It will also be removed from ${draftsUsingEditingClass} unpublished ${draftsUsingEditingClass === 1 ? 'schedule' : 'schedules'}.`}
                              </p>
                              <div className={styles.buttonRow}>
                                <button
                                  className={styles.dangerButtonSolid}
                                  type="button"
                                  disabled={deleting}
                                  onClick={() => void deleteClass()}
                                >
                                  {deleting ? 'Deleting…' : 'Yes, delete class'}
                                </button>
                                <button
                                  className={styles.quietButton}
                                  type="button"
                                  disabled={deleting}
                                  onClick={() => setConfirmingDelete(false)}
                                >
                                  Keep it
                                </button>
                              </div>
                            </div>
                          )}
                        </form>
                      )}
                    </section>
                  </aside>

                  <section className={styles.panel} aria-label="Selected schedule">
                    <ScheduleEditor
                      coopId={coopId}
                      schedule={selectedSchedule}
                      classes={classes}
                      onRefresh={refreshCurrentCoop}
                    />
                  </section>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
