// A family's private page: classes, announcements, fees, volunteer hours and attendance.
'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import styles from '@/components/custom/coop/coop.module.css';
import {
  CalendarLinks,
  ClassCard,
  PrintButton,
  PublicHeader,
  PublicMessage,
  ScheduleView,
} from '@/components/custom/coop/public/public-parts';
import {
  errorMessage,
  formatDay,
  formatTimestamp,
  localToday,
  post,
} from '@/components/custom/coop/shared';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import { FamilyHome, type FamilyHome as FamilyHomeType } from '@/lib/contracts/coop-features';
import { formatHours, formatMoney, hoursToMinutes } from '@/lib/coop/money';

export function FamilyHomeView({ token }: { token: string }) {
  const [home, setHome] = useState<FamilyHomeType | null>(null);
  const [failed, setFailed] = useState<'missing' | 'error' | null>(null);
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState({ date: localToday(), hours: '', description: '' });
  const [newChild, setNewChild] = useState<{ name: string; ageGroup: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setHome(await apiFetch(`/api/public/families/${token}`, { schema: FamilyHome }));
    } catch (error) {
      const status = error instanceof Error ? /\((\d+)\)/.exec(error.message)?.[1] : undefined;
      setFailed(status === '404' ? 'missing' : 'error');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(path: string, init: RequestInit, message: string) {
    setBusy(true);
    try {
      setHome(await apiFetch(path, { ...init, schema: FamilyHome }));
      toast.success(message);
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (failed === 'missing') {
    return (
      <PublicMessage
        title="This family link isn’t working"
        body="Ask your co-op coordinator to email you your family page link again."
      />
    );
  }
  if (failed) {
    return (
      <PublicMessage
        title="Something went wrong"
        body="Check your connection and reload the page."
      />
    );
  }
  if (!home) {
    return (
      <main className={styles.publicPage}>
        <output className={base.loading}>Loading…</output>
      </main>
    );
  }

  const ageGroups = home.schedule?.rotations.map((rotation) => rotation.ageGroup) ?? [];
  const { volunteer, fees } = home;
  const percent = volunteer.requiredMinutes
    ? Math.min(100, Math.round((volunteer.approvedMinutes / volunteer.requiredMinutes) * 100))
    : null;

  return (
    <main className={styles.publicPage}>
      <PublicHeader eyebrow={home.coopName} title={`Hi, ${home.parentName}`}>
        <PrintButton />
      </PublicHeader>
      <p className={`${base.muted} ${styles.noPrint}`}>
        This is your family’s private page. Bookmark it, and don’t share the link outside your
        family.
      </p>
      {home.calendarUrl && <CalendarLinks url={home.calendarUrl} />}

      <section className={styles.section} aria-labelledby="children-heading">
        <h2 className={styles.sectionTitle} id="children-heading">
          Your children’s classes
        </h2>
        <p className={base.muted} style={{ margin: 0 }}>
          Your co-op’s coordinators place children in classes. For changes, reply to any email from
          your co-op.
        </p>
        {home.children.map((child) => (
          <div className={styles.childCard} key={child.id}>
            <span className={styles.rowTitle}>
              {child.name}
              {child.ageGroup ? <span className={base.muted}> · {child.ageGroup}</span> : null}
            </span>
            {child.enrollments.length ? (
              <div className={styles.stack} style={{ gap: 8 }}>
                {child.enrollments.map((entry) => (
                  <ClassCard
                    key={entry.id}
                    item={entry.class}
                    extra={
                      <span className={base.buttonRow} style={{ marginTop: 4 }}>
                        <span
                          className={`${styles.pill} ${entry.status === 'enrolled' ? styles.pillGood : styles.pillWarn}`}
                        >
                          {entry.status === 'enrolled'
                            ? 'Enrolled'
                            : `Waitlist${entry.waitlistPosition ? ` #${entry.waitlistPosition}` : ''}`}
                        </span>
                      </span>
                    }
                  />
                ))}
              </div>
            ) : (
              <p className={base.muted}>
                Not placed in classes yet. Your coordinators will let you know.
              </p>
            )}
          </div>
        ))}
        {home.registrationOpen && home.schedule && (
          <div className={styles.noPrint}>
            {newChild ? (
              <form
                className={styles.childCard}
                onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  const ok = await run(
                    `/api/public/families/${token}/children`,
                    post(newChild),
                    `${newChild.name} added`,
                  );
                  if (ok) setNewChild(null);
                }}
              >
                <div className={base.optionalGrid}>
                  <label className={base.smallLabel}>
                    Child’s name
                    <input
                      className={base.field}
                      value={newChild.name}
                      required
                      maxLength={120}
                      onChange={(event) => setNewChild({ ...newChild, name: event.target.value })}
                    />
                  </label>
                  <label className={base.smallLabel}>
                    Age group
                    <select
                      className={base.select}
                      value={newChild.ageGroup}
                      onChange={(event) =>
                        setNewChild({ ...newChild, ageGroup: event.target.value })
                      }
                    >
                      <option value="">Choose…</option>
                      {ageGroups.map((group) => (
                        <option key={group}>{group}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className={base.buttonRow}>
                  <button className={base.button} type="submit" disabled={busy}>
                    Add child
                  </button>
                  <button
                    className={base.quietButton}
                    type="button"
                    onClick={() => setNewChild(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                className={base.quietButton}
                type="button"
                onClick={() => setNewChild({ name: '', ageGroup: '' })}
              >
                Add another child
              </button>
            )}
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="announcements-heading">
        <h2 className={styles.sectionTitle} id="announcements-heading">
          Announcements
        </h2>
        {home.announcements.length ? (
          <ul className={styles.list}>
            {home.announcements.map((item) => (
              <li className={styles.classCard} key={item.id}>
                <span className={styles.rowTitle}>{item.title}</span>
                <span className={styles.rowMeta}>
                  {formatTimestamp(item.createdAt)}
                  {item.className ? ` · ${item.className}` : ''}
                </span>
                <p
                  className={`${styles.prewrap} ${base.description}`}
                  style={{ margin: '6px 0 0' }}
                >
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className={base.muted}>No announcements yet.</p>
        )}
      </section>

      <div className={styles.grid2}>
        <section className={styles.section} aria-labelledby="fees-heading">
          <h2 className={styles.sectionTitle} id="fees-heading">
            Fees
          </h2>
          {fees.lines.length || fees.payments.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <tbody>
                  {fees.lines.map((line, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: derived lines have no ids.
                    <tr key={index}>
                      <td>{line.label}</td>
                      <td className={styles.num}>{formatMoney(line.amountCents)}</td>
                    </tr>
                  ))}
                  {fees.payments.map((payment, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: payments are shown without ids.
                    <tr key={`p${index}`}>
                      <td>
                        Paid · {payment.method} · {formatDay(payment.paidOn)}
                      </td>
                      <td className={styles.num}>−{formatMoney(payment.amountCents)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <strong>{fees.balanceCents >= 0 ? 'Balance due' : 'Credit'}</strong>
                    </td>
                    <td className={styles.num}>
                      <strong>{formatMoney(Math.abs(fees.balanceCents))}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className={base.muted}>No fees yet.</p>
          )}
          {fees.paymentInstructions && (
            <p className={`${styles.note} ${styles.prewrap}`}>
              <strong>How to pay:</strong> {fees.paymentInstructions}
            </p>
          )}
          <p className={base.muted} style={{ margin: 0 }}>
            Online payment is coming soon.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="hours-heading">
          <h2 className={styles.sectionTitle} id="hours-heading">
            Volunteer hours
          </h2>
          <p className={base.description} style={{ margin: 0 }}>
            {formatHours(volunteer.approvedMinutes)} approved
            {volunteer.requiredMinutes ? ` of ${formatHours(volunteer.requiredMinutes)}` : ''}
            {volunteer.pendingMinutes
              ? ` · ${formatHours(volunteer.pendingMinutes)} waiting for approval`
              : ''}
          </p>
          {percent !== null && (
            <div className={styles.progress} aria-hidden="true">
              <div className={styles.progressBar} style={{ width: `${percent}%` }} />
            </div>
          )}
          <form
            className={`${base.inlineForm} ${styles.noPrint}`}
            onSubmit={async (event) => {
              event.preventDefault();
              const minutes = hoursToMinutes(hours.hours);
              if (!minutes) {
                toast.error('Enter the hours, like 2 or 1.5.');
                return;
              }
              const ok = await run(
                `/api/public/families/${token}/volunteer`,
                post({ date: hours.date, minutes, description: hours.description }),
                'Hours logged. A coordinator will approve them.',
              );
              if (ok) setHours({ ...hours, hours: '', description: '' });
            }}
          >
            <strong className={styles.rowTitle}>Log volunteer time</strong>
            <div className={base.optionalGrid}>
              <label className={base.smallLabel}>
                Date
                <input
                  className={base.field}
                  type="date"
                  value={hours.date}
                  required
                  onChange={(event) => setHours({ ...hours, date: event.target.value })}
                />
              </label>
              <label className={base.smallLabel}>
                Hours
                <input
                  className={base.field}
                  inputMode="decimal"
                  value={hours.hours}
                  required
                  onChange={(event) => setHours({ ...hours, hours: event.target.value })}
                />
              </label>
            </div>
            <label className={base.smallLabel}>
              What you did
              <input
                className={base.field}
                value={hours.description}
                required
                maxLength={300}
                onChange={(event) => setHours({ ...hours, description: event.target.value })}
              />
            </label>
            <div className={base.buttonRow}>
              <button className={base.button} type="submit" disabled={busy}>
                Log hours
              </button>
            </div>
          </form>
          {volunteer.logs.length > 0 && (
            <ul className={styles.list}>
              {volunteer.logs.slice(0, 15).map((log) => (
                <li className={styles.row} key={log.id}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>
                      {formatHours(log.minutes)} · {formatDay(log.date)}
                    </span>
                    <span className={styles.rowMeta}>{log.description}</span>
                  </span>
                  <span
                    className={`${styles.pill} ${log.status === 'approved' ? styles.pillGood : log.status === 'declined' ? styles.pillBad : styles.pillWarn}`}
                  >
                    {log.status === 'approved'
                      ? 'Approved'
                      : log.status === 'declined'
                        ? 'Declined'
                        : 'Waiting'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {(home.attendance.present > 0 || home.attendance.absent > 0) && (
        <section className={styles.section} aria-labelledby="attendance-heading">
          <h2 className={styles.sectionTitle} id="attendance-heading">
            Attendance
          </h2>
          <p className={base.description} style={{ margin: 0 }}>
            {home.attendance.present} present · {home.attendance.absent} absent
          </p>
          <ul className={styles.list}>
            {home.attendance.recent.map((entry) => (
              <li className={styles.row} key={`${entry.date}-${entry.childName}`}>
                <span className={styles.rowTitle}>
                  {entry.childName} · {formatDay(entry.date)}
                </span>
                <span
                  className={`${styles.pill} ${entry.status === 'present' ? styles.pillGood : styles.pillBad}`}
                >
                  {entry.status === 'present' ? 'Present' : 'Absent'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {home.schedule && (
        <section className={styles.section} aria-labelledby="full-schedule-heading">
          <h2 className={styles.sectionTitle} id="full-schedule-heading">
            Full co-op schedule
          </h2>
          <ScheduleView schedule={home.schedule} />
        </section>
      )}
      <p className={`${styles.footerNote} ${styles.noPrint}`}>
        Shared with Kithwheel, the co-op organizer.
      </p>
    </main>
  );
}
