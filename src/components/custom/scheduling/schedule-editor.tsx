// Editable draft, review, publish, and withdraw controls.
'use client';

import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-client';
import { type CoopClassRecord, ScheduleList, type ScheduleRecord } from '@/lib/contracts/coops';
import styles from './scheduling.module.css';

type DraftRotation = { key: string; ageGroup: string; classIds: string[] };

function messageFrom(error: unknown) {
  if (error instanceof Error && error.cause && typeof error.cause === 'object') {
    const body = error.cause as Record<string, unknown>;
    if (typeof body.error === 'string') return body.error;
  }
  return error instanceof Error ? error.message : 'Please try again.';
}

function factsFor(item: Pick<CoopClassRecord, 'teacher' | 'room' | 'time'>) {
  return [
    item.teacher ? `Teacher · ${item.teacher}` : null,
    item.room ? `Room · ${item.room}` : null,
    item.time,
  ].filter((value): value is string => value !== null);
}

export interface ScheduleEditorProps {
  coopId: string;
  schedule: ScheduleRecord | null;
  classes: CoopClassRecord[];
  onRefresh: () => Promise<void>;
}

export function ScheduleEditor({ coopId, schedule, classes, onRefresh }: ScheduleEditorProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [rotations, setRotations] = useState<DraftRotation[]>([]);
  const [pendingClasses, setPendingClasses] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(schedule?.title ?? '');
    setRotations(
      schedule?.rotations.map((rotation) => ({
        key: rotation.id,
        ageGroup: rotation.ageGroup,
        classIds: rotation.entries.map((entry) => entry.class.id),
      })) ?? [],
    );
    setPendingClasses({});
    setEditing(false);
  }, [schedule]);

  if (!schedule) {
    return (
      <div className={styles.emptyState}>
        <h2 className={styles.emptyTitle}>Build a co-op schedule</h2>
        <p className={styles.description}>
          Create a draft, add age groups, then arrange the classes your co-op has entered.
        </p>
      </div>
    );
  }

  const scheduleId = schedule.id;
  const statusLabel = schedule.status === 'archived' ? 'replaced' : schedule.status;
  const assignedClassIds = new Set(rotations.flatMap((rotation) => rotation.classIds));

  function addRotation() {
    setRotations((current) => [
      ...current,
      { key: `rotation-${crypto.randomUUID()}`, ageGroup: '', classIds: [] },
    ]);
  }

  function reorderRotation(index: number, direction: -1 | 1) {
    setRotations((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const sourceItem = next[index];
      const targetItem = next[target];
      if (!sourceItem || !targetItem) return current;
      next[index] = targetItem;
      next[target] = sourceItem;
      return next;
    });
  }

  function addClass(rotationKey: string) {
    const classId = pendingClasses[rotationKey];
    if (!classId || assignedClassIds.has(classId)) return;
    setRotations((current) =>
      current.map((rotation) =>
        rotation.key === rotationKey
          ? { ...rotation, classIds: [...rotation.classIds, classId] }
          : rotation,
      ),
    );
    setPendingClasses((current) => ({ ...current, [rotationKey]: '' }));
  }

  function reorderClass(rotationKey: string, index: number, direction: -1 | 1) {
    setRotations((current) =>
      current.map((rotation) => {
        if (rotation.key !== rotationKey) return rotation;
        const target = index + direction;
        if (target < 0 || target >= rotation.classIds.length) return rotation;
        const classIds = [...rotation.classIds];
        const sourceId = classIds[index];
        const targetId = classIds[target];
        if (!sourceId || !targetId) return rotation;
        classIds[index] = targetId;
        classIds[target] = sourceId;
        return { ...rotation, classIds };
      }),
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/api/coops/${coopId}/schedules/${scheduleId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          rotations: rotations.map((rotation) => ({
            ageGroup: rotation.ageGroup,
            classIds: rotation.classIds,
          })),
        }),
        schema: ScheduleList,
      });
      setEditing(false);
      await onRefresh();
      toast.success('Saved arrangement. Review the latest version below.');
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(action: 'publish' | 'withdraw') {
    setSaving(true);
    try {
      await apiFetch(`/api/coops/${coopId}/schedules/${scheduleId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({}),
        schema: ScheduleList,
      });
      await onRefresh();
      toast.success(
        action === 'publish'
          ? 'Schedule published as current.'
          : 'Schedule withdrawn from current use.',
      );
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.editor}>
      <header className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Selected schedule</p>
          {!editing && <h2 className={styles.panelTitle}>{schedule.title}</h2>}
          {!editing && (
            <span
              className={`${styles.status} ${schedule.status === 'published' ? styles.statusPublished : ''} ${schedule.status === 'withdrawn' ? styles.statusWithdrawn : ''}`}
            >
              {statusLabel}
            </span>
          )}
        </div>
        <div className={styles.buttonRow}>
          {!editing && (
            <button
              className={styles.quietButton}
              type="button"
              onClick={() => setEditing(true)}
              disabled={saving}
            >
              Edit
            </button>
          )}
          {editing && (
            <button
              className={styles.quietButton}
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </button>
          )}
          {!editing && schedule.status === 'published' && (
            <button
              className={styles.quietButton}
              type="button"
              onClick={() => void changeStatus('withdraw')}
              disabled={saving}
            >
              Withdraw
            </button>
          )}
          {!editing && schedule.status !== 'published' && (
            <button
              className={styles.button}
              type="button"
              onClick={() => void changeStatus('publish')}
              disabled={
                saving ||
                !schedule.rotations.length ||
                schedule.rotations.some((rotation) => !rotation.entries.length)
              }
            >
              Publish schedule
            </button>
          )}
        </div>
      </header>

      {editing ? (
        <form className={styles.editor} onSubmit={save}>
          <label className={styles.smallLabel} htmlFor="edit-schedule-title">
            Schedule name
            <input
              id="edit-schedule-title"
              className={styles.field}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={120}
            />
          </label>

          <div className={styles.rotationList}>
            {rotations.map((rotation, rotationIndex) => (
              <section
                className={styles.rotation}
                key={rotation.key}
                aria-label={`Age-group rotation ${rotationIndex + 1}`}
              >
                <div className={styles.rotationHeader}>
                  <div className={styles.rotationHeading}>
                    <span className={styles.rotationNumber}>{rotationIndex + 1}</span> Rotation
                    order
                  </div>
                  <div className={styles.smallActions}>
                    <button
                      className={styles.smallButton}
                      type="button"
                      aria-label={`Move rotation ${rotationIndex + 1} up`}
                      onClick={() => reorderRotation(rotationIndex, -1)}
                      disabled={rotationIndex === 0}
                    >
                      Move up
                    </button>
                    <button
                      className={styles.smallButton}
                      type="button"
                      aria-label={`Move rotation ${rotationIndex + 1} down`}
                      onClick={() => reorderRotation(rotationIndex, 1)}
                      disabled={rotationIndex === rotations.length - 1}
                    >
                      Move down
                    </button>
                    <button
                      className={styles.smallButton}
                      type="button"
                      onClick={() =>
                        setRotations((current) =>
                          current.filter((item) => item.key !== rotation.key),
                        )
                      }
                    >
                      Remove rotation
                    </button>
                  </div>
                </div>
                <div className={styles.ageGroupField}>
                  <label htmlFor={`age-group-${rotation.key}`}>
                    Age group
                    <input
                      id={`age-group-${rotation.key}`}
                      className={styles.field}
                      value={rotation.ageGroup}
                      placeholder="Enter the age group used by your co-op"
                      onChange={(event) =>
                        setRotations((current) =>
                          current.map((item) =>
                            item.key === rotation.key
                              ? { ...item, ageGroup: event.target.value }
                              : item,
                          ),
                        )
                      }
                      required
                      maxLength={80}
                    />
                  </label>
                </div>

                <div className={styles.entryList}>
                  {rotation.classIds.map((classId, classIndex) => {
                    const item = classes.find((candidate) => candidate.id === classId);
                    if (!item) return null;
                    const facts = factsFor(item);
                    return (
                      <div className={styles.entryRow} key={item.id}>
                        <div className={styles.entryCopy}>
                          <span className={styles.entryName}>{item.name}</span>
                          {facts.length > 0 && (
                            <span className={styles.facts}>
                              {facts.map((fact) => (
                                <span key={fact}>{fact}</span>
                              ))}
                            </span>
                          )}
                        </div>
                        <div className={styles.smallActions}>
                          <button
                            className={styles.smallButton}
                            type="button"
                            aria-label={`Move ${item.name} up`}
                            onClick={() => reorderClass(rotation.key, classIndex, -1)}
                            disabled={classIndex === 0}
                          >
                            <ArrowUp aria-hidden="true" size={13} />
                          </button>
                          <button
                            className={styles.smallButton}
                            type="button"
                            aria-label={`Move ${item.name} down`}
                            onClick={() => reorderClass(rotation.key, classIndex, 1)}
                            disabled={classIndex === rotation.classIds.length - 1}
                          >
                            <ArrowDown aria-hidden="true" size={13} />
                          </button>
                          <button
                            className={styles.smallButton}
                            type="button"
                            aria-label={`Remove ${item.name}`}
                            onClick={() =>
                              setRotations((current) =>
                                current.map((candidate) =>
                                  candidate.key === rotation.key
                                    ? {
                                        ...candidate,
                                        classIds: candidate.classIds.filter((id) => id !== item.id),
                                      }
                                    : candidate,
                                ),
                              )
                            }
                          >
                            <Trash2 aria-hidden="true" size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!rotation.classIds.length && (
                    <p className={styles.muted}>No classes in this age group yet.</p>
                  )}
                </div>

                <div className={styles.addClassRow}>
                  <label className={styles.smallLabel} htmlFor={`class-select-${rotation.key}`}>
                    Add a class from this co-op
                    <select
                      id={`class-select-${rotation.key}`}
                      className={styles.select}
                      value={pendingClasses[rotation.key] ?? ''}
                      onChange={(event) =>
                        setPendingClasses((current) => ({
                          ...current,
                          [rotation.key]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Choose a class</option>
                      {classes
                        .filter((item) => !assignedClassIds.has(item.id))
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className={styles.quietButton}
                    type="button"
                    onClick={() => addClass(rotation.key)}
                    disabled={!pendingClasses[rotation.key]}
                  >
                    <Plus aria-hidden="true" size={14} /> Add class
                  </button>
                </div>
              </section>
            ))}
          </div>

          <div className={styles.buttonRow}>
            <button className={styles.quietButton} type="button" onClick={addRotation}>
              <Plus aria-hidden="true" size={15} /> Add age-group rotation
            </button>
            <button className={styles.button} type="submit" disabled={saving}>
              <Save aria-hidden="true" size={15} /> Save arrangement
            </button>
          </div>
        </form>
      ) : (
        <div>
          {schedule.rotations.length ? (
            schedule.rotations.map((rotation, rotationIndex) => (
              <section
                className={styles.rotationView}
                key={rotation.id}
                aria-label={`Rotation ${rotationIndex + 1}: ${rotation.ageGroup}`}
              >
                <h3 className={styles.rotationViewTitle}>
                  {rotationIndex + 1}. {rotation.ageGroup}
                </h3>
                {rotation.entries.length ? (
                  <div className={styles.viewEntries}>
                    {rotation.entries.map((entry) => {
                      const facts = factsFor(entry.class);
                      return (
                        <article className={styles.viewEntry} key={entry.id}>
                          <strong className={styles.entryName}>{entry.class.name}</strong>
                          {entry.class.description && (
                            <span className={styles.muted}>{entry.class.description}</span>
                          )}
                          {facts.length > 0 && (
                            <span className={styles.facts}>
                              {facts.map((fact) => (
                                <span key={fact}>{fact}</span>
                              ))}
                            </span>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className={styles.muted}>No classes assigned.</p>
                )}
              </section>
            ))
          ) : (
            <div className={styles.emptyState}>
              <h3 className={styles.emptyTitle}>No rotations saved yet</h3>
              <p className={styles.description}>
                Edit this draft to add age groups and select this co-op&apos;s classes.
              </p>
              <button className={styles.button} type="button" onClick={() => setEditing(true)}>
                Edit schedule
              </button>
            </div>
          )}
          {!!schedule.rotations.length && (
            <p className={styles.muted}>
              Saved arrangement · {schedule.rotations.length}{' '}
              {schedule.rotations.length === 1 ? 'rotation' : 'rotations'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
