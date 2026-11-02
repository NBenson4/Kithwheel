// Volunteer hours tab: the co-op's requirement, entries waiting for approval, and totals.
'use client';

import { Check, Download, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import styles from '@/components/custom/coop/coop.module.css';
import { LoadState, useFamilyOverview } from '@/components/custom/coop/families-panel';
import {
  downloadCsv,
  errorMessage,
  formatDay,
  localToday,
  post,
} from '@/components/custom/coop/shared';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import {
  CoopSettings,
  type CoopSettings as CoopSettingsType,
  FamilyOverview,
} from '@/lib/contracts/coop-features';
import { formatHours, hoursToMinutes } from '@/lib/coop/money';

type Props = {
  coopId: string;
  settings: CoopSettingsType;
  onSettings: (settings: CoopSettingsType) => void;
};

export function VolunteerPanel({ coopId, settings, onSettings }: Props) {
  const { overview, setOverview, error, reload } = useFamilyOverview(coopId);
  const [required, setRequired] = useState(
    settings.volunteerMinutesRequired ? String(settings.volunteerMinutesRequired / 60) : '',
  );
  const [entry, setEntry] = useState({
    familyId: '',
    date: localToday(),
    hours: '',
    description: '',
  });
  const [busy, setBusy] = useState(false);

  async function saveRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minutes = required.trim() === '' ? null : Math.round(Number(required) * 60);
    if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0)) {
      toast.error('Enter the required hours as a number.');
      return;
    }
    setBusy(true);
    try {
      onSettings(
        await apiFetch(`/api/coops/${coopId}/settings`, {
          ...post({ volunteerMinutesRequired: minutes }, 'PATCH'),
          schema: CoopSettings,
        }),
      );
      await reload();
      toast.success('Requirement saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function run(path: string, init: RequestInit, message: string) {
    setBusy(true);
    try {
      setOverview(await apiFetch(path, { ...init, schema: FamilyOverview }));
      toast.success(message);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!overview) return <LoadState error={error} onRetry={() => void reload()} />;

  const requiredMinutes = overview.volunteerMinutesRequired;
  const pending = overview.families.flatMap((family) =>
    family.volunteer.logs
      .filter((log) => log.status === 'pending')
      .map((log) => ({ ...log, familyName: family.parentName })),
  );
  const approvedTotal = overview.families.reduce(
    (sum, family) => sum + family.volunteer.approvedMinutes,
    0,
  );
  const metCount = requiredMinutes
    ? overview.families.filter((family) => family.volunteer.approvedMinutes >= requiredMinutes)
        .length
    : null;

  function exportHours() {
    if (!overview) return;
    const rows: (string | number)[][] = [['Family', 'Date', 'Hours', 'Description', 'Status']];
    for (const family of overview.families) {
      for (const log of family.volunteer.logs) {
        rows.push([family.parentName, log.date, log.minutes / 60, log.description, log.status]);
      }
    }
    downloadCsv('volunteer-hours.csv', rows);
  }

  return (
    <div className={styles.stack}>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatHours(approvedTotal)}</span>
          <span className={styles.statLabel}>Approved across the co-op</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{pending.length}</span>
          <span className={styles.statLabel}>Waiting for approval</span>
        </div>
        {metCount !== null && (
          <div className={styles.stat}>
            <span className={styles.statValue}>
              {metCount} / {overview.families.length}
            </span>
            <span className={styles.statLabel}>Families who met the requirement</span>
          </div>
        )}
      </div>

      <div className={styles.grid2} style={{ alignItems: 'start' }}>
        <div className={styles.stack}>
          <section className={base.panel} aria-labelledby="requirement-heading">
            <div className={base.panelHeader}>
              <h2 className={base.panelTitle} id="requirement-heading">
                Requirement
              </h2>
            </div>
            <form className={styles.stack} onSubmit={saveRequirement}>
              <label className={base.smallLabel} htmlFor="required-hours">
                Hours each family should volunteer this term (leave empty for none)
                <input
                  id="required-hours"
                  className={base.field}
                  inputMode="decimal"
                  value={required}
                  onChange={(event) => setRequired(event.target.value)}
                />
              </label>
              <p className={base.muted}>
                Families log their own time from their family page; you approve it here.
              </p>
              <div className={base.buttonRow}>
                <button className={base.button} type="submit" disabled={busy}>
                  Save requirement
                </button>
              </div>
            </form>
          </section>

          <section className={base.panel} aria-labelledby="pending-heading">
            <div className={base.panelHeader}>
              <h2 className={base.panelTitle} id="pending-heading">
                Waiting for approval
              </h2>
              <span className={base.count}>{pending.length}</span>
            </div>
            {pending.length ? (
              <ul className={styles.list}>
                {pending.map((log) => (
                  <li className={styles.row} key={log.id}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>
                        {log.familyName} · {formatHours(log.minutes)}
                      </span>
                      <span className={styles.rowMeta}>
                        {formatDay(log.date)} · {log.description}
                      </span>
                    </span>
                    <span className={styles.rowActions}>
                      <button
                        className={styles.chipButton}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            `/api/coops/${coopId}/volunteer/${log.id}`,
                            post({ status: 'approved' }, 'PATCH'),
                            'Hours approved',
                          )
                        }
                      >
                        <Check aria-hidden="true" size={12} /> Approve
                      </button>
                      <button
                        className={styles.chipButton}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            `/api/coops/${coopId}/volunteer/${log.id}`,
                            post({ status: 'declined' }, 'PATCH'),
                            'Hours declined',
                          )
                        }
                      >
                        <X aria-hidden="true" size={12} /> Decline
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={base.muted}>Nothing waiting.</p>
            )}
          </section>

          <form
            className={base.inlineForm}
            onSubmit={async (event) => {
              event.preventDefault();
              const minutes = hoursToMinutes(entry.hours);
              if (!minutes) {
                toast.error('Enter the hours, like 2 or 1.5.');
                return;
              }
              const ok = await run(
                `/api/coops/${coopId}/volunteer`,
                post({
                  familyId: entry.familyId,
                  date: entry.date,
                  minutes,
                  description: entry.description,
                }),
                'Hours added',
              );
              if (ok) setEntry({ ...entry, hours: '', description: '' });
            }}
          >
            <strong className={styles.rowTitle}>Add hours for a family</strong>
            <label className={base.smallLabel}>
              Family
              <select
                className={base.select}
                value={entry.familyId}
                required
                onChange={(event) => setEntry({ ...entry, familyId: event.target.value })}
              >
                <option value="">Choose a family</option>
                {overview.families.map((family) => (
                  <option key={family.id} value={family.id}>
                    {family.parentName}
                  </option>
                ))}
              </select>
            </label>
            <div className={base.optionalGrid}>
              <label className={base.smallLabel}>
                Date
                <input
                  className={base.field}
                  type="date"
                  value={entry.date}
                  required
                  onChange={(event) => setEntry({ ...entry, date: event.target.value })}
                />
              </label>
              <label className={base.smallLabel}>
                Hours
                <input
                  className={base.field}
                  inputMode="decimal"
                  value={entry.hours}
                  required
                  onChange={(event) => setEntry({ ...entry, hours: event.target.value })}
                />
              </label>
            </div>
            <label className={base.smallLabel}>
              What it was for
              <input
                className={base.field}
                value={entry.description}
                required
                maxLength={300}
                placeholder="Set-up crew, taught art, cleaning…"
                onChange={(event) => setEntry({ ...entry, description: event.target.value })}
              />
            </label>
            <div className={base.buttonRow}>
              <button
                className={base.button}
                type="submit"
                disabled={busy || !overview.families.length}
              >
                Add hours
              </button>
            </div>
          </form>
        </div>

        <section className={base.panel} aria-labelledby="hours-heading">
          <div className={base.panelHeader}>
            <h2 className={base.panelTitle} id="hours-heading">
              Hours by family
            </h2>
            <button
              className={base.quietButton}
              type="button"
              onClick={exportHours}
              disabled={!overview.families.length}
            >
              <Download aria-hidden="true" size={14} /> Spreadsheet
            </button>
          </div>
          {overview.families.length ? (
            <div className={styles.stack} style={{ gap: 8 }}>
              {overview.families.map((family) => {
                const done = family.volunteer.approvedMinutes;
                const percent = requiredMinutes
                  ? Math.min(100, Math.round((done / requiredMinutes) * 100))
                  : null;
                return (
                  <details className={styles.details} key={family.id}>
                    <summary>
                      <span className={styles.rowMain} style={{ flex: 1 }}>
                        <span className={styles.rowTitle}>{family.parentName}</span>
                        <span className={styles.rowMeta}>
                          {formatHours(done)}
                          {requiredMinutes ? ` of ${formatHours(requiredMinutes)}` : ''}
                          {family.volunteer.pendingMinutes
                            ? ` · ${formatHours(family.volunteer.pendingMinutes)} waiting`
                            : ''}
                        </span>
                        {percent !== null && (
                          <span className={styles.progress} aria-hidden="true">
                            <span
                              className={styles.progressBar}
                              style={{ width: `${percent}%`, display: 'block' }}
                            />
                          </span>
                        )}
                      </span>
                    </summary>
                    <div className={styles.detailsBody}>
                      {family.volunteer.logs.length ? (
                        <ul className={styles.list}>
                          {family.volunteer.logs.map((log) => (
                            <li className={styles.row} key={log.id}>
                              <span className={styles.rowMain}>
                                <span className={styles.rowTitle}>
                                  {formatHours(log.minutes)} · {formatDay(log.date)}
                                </span>
                                <span className={styles.rowMeta}>{log.description}</span>
                              </span>
                              <span className={styles.rowActions}>
                                <span
                                  className={`${styles.pill} ${log.status === 'approved' ? styles.pillGood : log.status === 'declined' ? styles.pillBad : styles.pillWarn}`}
                                >
                                  {log.status === 'approved'
                                    ? 'Approved'
                                    : log.status === 'declined'
                                      ? 'Declined'
                                      : 'Waiting'}
                                </span>
                                <button
                                  className={styles.chipButton}
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(
                                      `/api/coops/${coopId}/volunteer/${log.id}`,
                                      post({}, 'DELETE'),
                                      'Entry deleted',
                                    )
                                  }
                                >
                                  Delete
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className={base.muted}>No hours logged yet.</p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          ) : (
            <p className={base.muted}>Families appear here once they register.</p>
          )}
        </section>
      </div>
    </div>
  );
}
