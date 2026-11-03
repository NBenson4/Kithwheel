// Check-in tab: morning check-in for one co-op day, the tablet link, and attendance history.
'use client';

import { Download, Tablet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import styles from '@/components/custom/coop/coop.module.css';
import { LoadState } from '@/components/custom/coop/families-panel';
import { LinkBox } from '@/components/custom/coop/settings-panel';
import {
  downloadCsv,
  errorMessage,
  formatClock,
  formatDay,
  post,
} from '@/components/custom/coop/shared';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import {
  AttendanceDay,
  type AttendanceDay as AttendanceDayType,
  AttendanceHistory,
  type AttendanceHistory as AttendanceHistoryType,
  type CoopSettings,
  KioskLink,
} from '@/lib/contracts/coop-features';

type Props = {
  coopId: string;
  settings: CoopSettings;
  onSettings: (settings: CoopSettings) => void;
};

type Action = 'check_in' | 'check_out' | 'absent' | 'clear';

export function AttendancePanel({ coopId, settings, onSettings }: Props) {
  const [day, setDay] = useState<AttendanceDayType | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [history, setHistory] = useState<AttendanceHistoryType | null>(null);
  const [busyChild, setBusyChild] = useState<string | null>(null);
  const [makingKiosk, setMakingKiosk] = useState(false);

  const load = useCallback(
    async (requested: string | null) => {
      setError(false);
      try {
        const query = requested ? `?date=${requested}` : '';
        const result = await apiFetch(`/api/coops/${coopId}/attendance${query}`, {
          schema: AttendanceDay,
        });
        setDay(result);
        setDate(result.date);
      } catch {
        setError(true);
      }
    },
    [coopId],
  );

  const loadHistory = useCallback(async () => {
    try {
      setHistory(
        await apiFetch(`/api/coops/${coopId}/attendance/history`, { schema: AttendanceHistory }),
      );
    } catch {
      setHistory(null);
    }
  }, [coopId]);

  useEffect(() => {
    void load(null);
    void loadHistory();
  }, [load, loadHistory]);

  async function mark(childId: string, action: Action) {
    if (!date) return;
    setBusyChild(childId);
    try {
      setDay(
        await apiFetch(`/api/coops/${coopId}/attendance`, {
          ...post({ childId, date, action }),
          schema: AttendanceDay,
        }),
      );
      void loadHistory();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyChild(null);
    }
  }

  async function markRest() {
    if (!day || !date) return;
    const unmarked = day.children.filter((child) => child.status === null);
    for (const child of unmarked) await mark(child.childId, 'absent');
    toast.success(`${unmarked.length} marked absent`);
  }

  async function makeKiosk() {
    setMakingKiosk(true);
    try {
      const result = await apiFetch(`/api/coops/${coopId}/kiosk`, {
        ...post({}),
        schema: KioskLink,
      });
      onSettings({ ...settings, kioskUrl: result.kioskUrl });
      toast.success(
        settings.kioskUrl
          ? 'New tablet link created. The old one stopped working.'
          : 'Tablet link created',
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setMakingKiosk(false);
    }
  }

  function exportHistory() {
    if (!history) return;
    downloadCsv('attendance.csv', [
      ['Child', 'Family', 'Present', 'Absent'],
      ...history.children.map((child) => [
        child.childName,
        child.familyName,
        child.present,
        child.absent,
      ]),
    ]);
  }

  if (!day || !date) return <LoadState error={error} onRetry={() => void load(date)} />;

  const present = day.children.filter((child) => child.status === 'present').length;
  const absent = day.children.filter((child) => child.status === 'absent').length;
  const groups = new Map<string, typeof day.children>();
  for (const child of day.children) {
    const key = child.sectionName || 'Not in a section';
    groups.set(key, [...(groups.get(key) ?? []), child]);
  }

  return (
    <div className={styles.stack}>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{present}</span>
          <span className={styles.statLabel}>Checked in</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{absent}</span>
          <span className={styles.statLabel}>Absent</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{day.children.length - present - absent}</span>
          <span className={styles.statLabel}>Not marked yet</span>
        </div>
      </div>

      <div
        className={styles.grid2}
        style={{ alignItems: 'start', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)' }}
      >
        <section className={base.panel} aria-labelledby="checkin-heading">
          <div className={base.panelHeader}>
            <h2 className={base.panelTitle} id="checkin-heading">
              {date === day.today ? 'Today' : formatDay(date)}
            </h2>
            <div className={base.buttonRow}>
              <label className={base.smallLabel} htmlFor="attendance-date">
                <span className="sr-only">Co-op day</span>
                <input
                  id="attendance-date"
                  className={base.field}
                  type="date"
                  value={date}
                  max={day.today}
                  onChange={(event) => event.target.value && void load(event.target.value)}
                />
              </label>
              {date !== day.today && (
                <button
                  className={base.quietButton}
                  type="button"
                  onClick={() => void load(day.today)}
                >
                  Today
                </button>
              )}
            </div>
          </div>
          {day.children.length ? (
            <div className={styles.stack}>
              {[...groups.entries()].map(([group, children]) => (
                <div className={styles.attendanceGroup} key={group}>
                  <h3 className={styles.groupTitle}>{group}</h3>
                  <ul className={styles.list}>
                    {children.map((child) => (
                      <li className={styles.row} key={child.childId}>
                        <span className={styles.rowMain}>
                          <span className={styles.rowTitle}>{child.childName}</span>
                          <span className={styles.rowMeta}>
                            {child.familyName}
                            {child.status === 'present' && child.checkedInAt
                              ? ` · in ${formatClock(child.checkedInAt)}${child.source === 'kiosk' ? ' (tablet)' : ''}`
                              : ''}
                            {child.checkedOutAt ? ` · out ${formatClock(child.checkedOutAt)}` : ''}
                          </span>
                        </span>
                        <span className={styles.rowActions}>
                          {child.status === null && (
                            <>
                              <button
                                className={base.button}
                                style={{ minHeight: 34 }}
                                type="button"
                                disabled={busyChild === child.childId}
                                onClick={() => void mark(child.childId, 'check_in')}
                              >
                                Check in
                              </button>
                              <button
                                className={styles.chipButton}
                                type="button"
                                disabled={busyChild === child.childId}
                                onClick={() => void mark(child.childId, 'absent')}
                              >
                                Absent
                              </button>
                            </>
                          )}
                          {child.status === 'present' && (
                            <>
                              <span className={`${styles.pill} ${styles.pillGood}`}>
                                {child.checkedOutAt ? 'Picked up' : 'Here'}
                              </span>
                              {!child.checkedOutAt && (
                                <button
                                  className={styles.chipButton}
                                  type="button"
                                  disabled={busyChild === child.childId}
                                  onClick={() => void mark(child.childId, 'check_out')}
                                >
                                  Check out
                                </button>
                              )}
                            </>
                          )}
                          {child.status === 'absent' && (
                            <span className={`${styles.pill} ${styles.pillBad}`}>Absent</span>
                          )}
                          {child.status !== null && (
                            <button
                              className={styles.chipButton}
                              type="button"
                              disabled={busyChild === child.childId}
                              onClick={() => void mark(child.childId, 'clear')}
                            >
                              Undo
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {day.children.some((child) => child.status === null) && (
                <div className={base.buttonRow}>
                  <button
                    className={base.quietButton}
                    type="button"
                    disabled={busyChild !== null}
                    onClick={() => void markRest()}
                  >
                    Mark everyone not checked in as absent
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className={base.muted}>Children appear here once families register.</p>
          )}
        </section>

        <div className={styles.stack}>
          <section className={base.panel} aria-labelledby="kiosk-heading">
            <div className={base.panelHeader}>
              <h2 className={base.panelTitle} id="kiosk-heading">
                Check-in tablet
              </h2>
            </div>
            <div className={styles.stack}>
              <p className={base.muted}>
                Open this link on a tablet by the door. Parents tap their child’s name to check in
                and again at pickup. Anyone with the link can check children in, so keep it on the
                co-op’s device.
              </p>
              {settings.kioskUrl ? (
                <>
                  <LinkBox url={settings.kioskUrl} label="Check-in tablet link" />
                  <div className={base.buttonRow}>
                    <button
                      className={base.quietButton}
                      type="button"
                      disabled={makingKiosk}
                      onClick={() => void makeKiosk()}
                    >
                      Replace link
                    </button>
                  </div>
                </>
              ) : (
                <div className={base.buttonRow}>
                  <button
                    className={base.button}
                    type="button"
                    disabled={makingKiosk}
                    onClick={() => void makeKiosk()}
                  >
                    <Tablet aria-hidden="true" size={15} /> Create tablet link
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className={base.panel} aria-labelledby="history-heading">
            <div className={base.panelHeader}>
              <h2 className={base.panelTitle} id="history-heading">
                Attendance history
              </h2>
              <button
                className={base.quietButton}
                type="button"
                disabled={!history?.children.length}
                onClick={exportHistory}
              >
                <Download aria-hidden="true" size={14} /> Spreadsheet
              </button>
            </div>
            {history?.days.length ? (
              <ul className={styles.list}>
                {history.days.slice(0, 12).map((entry) => (
                  <li key={entry.date}>
                    <button
                      className={styles.row}
                      style={{
                        width: '100%',
                        font: 'inherit',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      type="button"
                      onClick={() => void load(entry.date)}
                    >
                      <span className={styles.rowTitle}>{formatDay(entry.date)}</span>
                      <span className={styles.rowMeta}>
                        {entry.present} present · {entry.absent} absent
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={base.muted}>No attendance recorded yet.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
