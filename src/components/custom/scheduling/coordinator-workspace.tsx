// Kithwheel's co-op schedule desk.
'use client';

import { CalendarDays, Plus, School } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ScheduleEditor } from '@/components/custom/scheduling/schedule-editor';
import styles from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import {
  type CoopRecord as Coop,
  type CoopClassRecord as CoopClass,
  CoopClassList,
  CoopClassRecord,
  CoopList,
  CoopRecord,
  ScheduleList,
  type ScheduleRecord,
} from '@/lib/contracts/coops';

type ClassDraft = {
  name: string;
  description: string;
  teacher: string;
  room: string;
  time: string;
};

const emptyClass: ClassDraft = { name: '', description: '', teacher: '', room: '', time: '' };

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Something went wrong. Please try again.';
  const cause = error.cause;
  if (cause && typeof cause === 'object') {
    const body = cause as Record<string, unknown>;
    if (typeof body.error === 'string') return body.error;
    if (body.errors && typeof body.errors === 'object') {
      const messages = Object.values(body.errors as Record<string, unknown>).flatMap((value) =>
        Array.isArray(value)
          ? value.filter((item): item is string => typeof item === 'string')
          : [],
      );
      if (messages[0]) return messages[0];
    }
  }
  return error.message;
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

  const loadCoops = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await apiFetch('/api/coops', { schema: CoopList });
      setCoops(result.items);
      setCoopId((current) =>
        result.items.some((coop) => coop.id === current) ? current : (result.items[0]?.id ?? ''),
      );
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
      const [classResult, scheduleResult] = await Promise.all([
        apiFetch(`/api/coops/${selectedCoopId}/classes`, { schema: CoopClassList }),
        apiFetch(`/api/coops/${selectedCoopId}/schedules`, { schema: ScheduleList }),
      ]);
      setClasses(classResult.items);
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

  function startClassEdit(item: CoopClass) {
    setEditingClassId(item.id);
    setClassDraft({
      name: item.name,
      description: item.description ?? '',
      teacher: item.teacher ?? '',
      room: item.room ?? '',
      time: item.time ?? '',
    });
    setClassFormOpen(true);
  }

  async function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!coopId) return;
    const path = editingClassId
      ? `/api/coops/${coopId}/classes/${editingClassId}`
      : `/api/coops/${coopId}/classes`;
    try {
      await apiFetch(path, {
        method: editingClassId ? 'PATCH' : 'POST',
        body: JSON.stringify(classDraft),
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
          <h1 className={styles.title}>Schedule desk</h1>
          <p className={styles.description}>
            Arrange your co-op&apos;s classes into age-group rotations, review the saved plan, then
            publish it when it is ready.
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
                      <span className={styles.muted}>Add a class before creating a schedule.</span>
                    )}
                  </form>
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
                      setClassDraft(emptyClass);
                      setClassFormOpen((open) => !open);
                    }}
                  >
                    <Plus aria-hidden="true" size={15} /> Add a class
                  </button>
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
                      </div>
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
                            setClassDraft(emptyClass);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
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
    </div>
  );
}
