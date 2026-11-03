// Settings tab: family link, calendar, check-in tablet link and the coordinator team.
'use client';

import { Copy, Link2, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import styles from '@/components/custom/coop/coop.module.css';
import { copyText, errorMessage, formatDay, post, WEEKDAYS } from '@/components/custom/coop/shared';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import {
  CoopSettings,
  type CoopSettings as CoopSettingsType,
  ShareLink,
  Team,
  type Team as TeamType,
  TIME_ZONES,
} from '@/lib/contracts/coop-features';

type Props = {
  coopId: string;
  settings: CoopSettingsType;
  onSettings: (settings: CoopSettingsType) => void;
  onLeft: () => void;
};

export function LinkBox({ url, label }: { url: string; label: string }) {
  return (
    <div className={styles.linkBox}>
      <span className={styles.linkText} title={url}>
        {url}
      </span>
      <button className={styles.chipButton} type="button" onClick={() => void copyText(url)}>
        <Copy aria-hidden="true" size={13} /> Copy
      </button>
      <a className={styles.chipButton} href={url} target="_blank" rel="noreferrer">
        Open
      </a>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function FamilyLinkCard({ coopId, settings, onSettings }: Omit<Props, 'onLeft'>) {
  const [busy, setBusy] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  async function makeLink() {
    setBusy(true);
    try {
      const result = await apiFetch(`/api/coops/${coopId}/share`, {
        ...post({}),
        schema: ShareLink,
      });
      onSettings({ ...settings, shareUrl: result.shareUrl });
      setConfirmRotate(false);
      toast.success(
        settings.shareUrl
          ? 'New link created. The old one no longer works.'
          : 'Family link created',
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={base.panel} aria-labelledby="family-link-heading">
      <div className={base.panelHeader}>
        <h2 className={base.panelTitle} id="family-link-heading">
          Family link
        </h2>
      </div>
      <div className={styles.stack}>
        <p className={base.muted}>
          One link for every family: it shows the approved section schedules, materials lists, a
          printable copy, calendar subscription, and the sign-up form when registration is open. No
          account needed.
        </p>
        {!settings.sectionsApproved && (
          <p className={styles.note}>
            Approve a section’s schedule so families have something to see.
          </p>
        )}
        {settings.shareUrl ? (
          <>
            <LinkBox url={settings.shareUrl} label="Family link" />
            {confirmRotate ? (
              <div className={base.confirmBox} role="alert">
                <p className={base.confirmText}>
                  Replace the link? Anyone using the old link (including bookmarks) will need the
                  new one. Families’ private pages keep working.
                </p>
                <div className={base.buttonRow}>
                  <button
                    className={base.dangerButtonSolid}
                    type="button"
                    disabled={busy}
                    onClick={() => void makeLink()}
                  >
                    Replace link
                  </button>
                  <button
                    className={base.quietButton}
                    type="button"
                    onClick={() => setConfirmRotate(false)}
                  >
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <div className={base.buttonRow}>
                <button
                  className={base.quietButton}
                  type="button"
                  onClick={() => setConfirmRotate(true)}
                >
                  <RefreshCw aria-hidden="true" size={14} /> Replace link
                </button>
              </div>
            )}
          </>
        ) : (
          <div className={base.buttonRow}>
            <button
              className={base.button}
              type="button"
              disabled={busy}
              onClick={() => void makeLink()}
            >
              <Link2 aria-hidden="true" size={15} /> Create family link
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function CalendarCard({ coopId, settings, onSettings }: Omit<Props, 'onLeft'>) {
  const [meetingDay, setMeetingDay] = useState(
    settings.meetingDay === null ? '' : String(settings.meetingDay),
  );
  const [termStart, setTermStart] = useState(settings.termStart ?? '');
  const [termEnd, setTermEnd] = useState(settings.termEnd ?? '');
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await apiFetch(`/api/coops/${coopId}/settings`, {
        ...post(
          {
            meetingDay: meetingDay === '' ? null : Number(meetingDay),
            termStart: termStart || null,
            termEnd: termEnd || null,
            timeZone,
          },
          'PATCH',
        ),
        schema: CoopSettings,
      });
      onSettings(updated);
      toast.success('Co-op day saved');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const ready = settings.meetingDay !== null && settings.termStart && settings.termEnd;
  return (
    <section className={base.panel} aria-labelledby="calendar-heading">
      <div className={base.panelHeader}>
        <h2 className={base.panelTitle} id="calendar-heading">
          Co-op day and calendar
        </h2>
        {ready ? (
          <span className={`${styles.pill} ${styles.pillGood}`}>Calendar on</span>
        ) : (
          <span className={styles.pill}>Not set</span>
        )}
      </div>
      <form className={styles.stack} onSubmit={save}>
        <p className={base.muted}>
          With these set, families can add the schedule to Google, Apple or Outlook calendars. Class
          times like “9:00–9:50” become weekly events; others go on an all-day co-op day event.
        </p>
        <div className={styles.grid2}>
          <label className={base.smallLabel} htmlFor="meeting-day">
            Co-op meets on
            <select
              id="meeting-day"
              className={base.select}
              value={meetingDay}
              onChange={(event) => setMeetingDay(event.target.value)}
            >
              <option value="">Choose a day</option>
              {WEEKDAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label className={base.smallLabel} htmlFor="time-zone">
            Time zone
            <select
              id="time-zone"
              className={base.select}
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
            >
              {TIME_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace('America/', '').replace('Pacific/', '').replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className={base.smallLabel} htmlFor="term-start">
            First co-op day
            <input
              id="term-start"
              className={base.field}
              type="date"
              value={termStart}
              onChange={(event) => setTermStart(event.target.value)}
            />
          </label>
          <label className={base.smallLabel} htmlFor="term-end">
            Last co-op day
            <input
              id="term-end"
              className={base.field}
              type="date"
              value={termEnd}
              onChange={(event) => setTermEnd(event.target.value)}
            />
          </label>
        </div>
        {ready && settings.termStart && settings.termEnd && settings.meetingDay !== null && (
          <p className={base.muted}>
            Every {WEEKDAYS[settings.meetingDay]}, {formatDay(settings.termStart)} to{' '}
            {formatDay(settings.termEnd)}.
          </p>
        )}
        <div className={base.buttonRow}>
          <button className={base.button} type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save co-op day'}
          </button>
        </div>
      </form>
    </section>
  );
}

function TeamCard({ coopId, onLeft }: { coopId: string; onLeft: () => void }) {
  const [team, setTeam] = useState<TeamType | null>(null);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTeam(await apiFetch(`/api/coops/${coopId}/team`, { schema: Team }));
    } catch {
      setTeam(null);
    }
  }, [coopId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    try {
      setTeam(
        await apiFetch(`/api/coops/${coopId}/team/invites`, { ...post({ email }), schema: Team }),
      );
      toast.success(`Invitation sent to ${email}`);
      setEmail('');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  async function cancelInvite(id: string) {
    try {
      setTeam(
        await apiFetch(`/api/coops/${coopId}/team/invites/${id}`, {
          ...post({}, 'DELETE'),
          schema: Team,
        }),
      );
      toast.success('Invitation cancelled');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function remove(id: string, isYou: boolean) {
    try {
      const result = await apiFetch(`/api/coops/${coopId}/team/members/${id}`, {
        ...post({}, 'DELETE'),
        schema: Team,
      });
      setConfirming(null);
      if (isYou) {
        toast.success('You left the co-op');
        onLeft();
        return;
      }
      setTeam(result);
      toast.success('Coordinator removed');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section className={base.panel} aria-labelledby="team-heading">
      <div className={base.panelHeader}>
        <h2 className={base.panelTitle} id="team-heading">
          Coordinators
        </h2>
        <span className={base.count}>{team?.members.length ?? '–'}</span>
      </div>
      <div className={styles.stack}>
        <p className={base.muted}>
          Co-coordinators can do everything you can: schedules, families, announcements, fees, hours
          and check-in.
        </p>
        {team ? (
          <ul className={styles.list}>
            {team.members.map((member) => (
              <li className={styles.row} key={member.id}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    {member.name}
                    {member.isYou ? ' (you)' : ''}
                  </span>
                  <span className={styles.rowMeta}>
                    {member.email}
                    {member.isCreator ? ' · Created the co-op' : ''}
                  </span>
                </span>
                {!member.isCreator && (
                  <span className={styles.rowActions}>
                    {confirming === member.id ? (
                      <>
                        <button
                          className={styles.chipButton}
                          type="button"
                          onClick={() => void remove(member.id, member.isYou)}
                        >
                          {member.isYou ? 'Yes, leave' : 'Yes, remove'}
                        </button>
                        <button
                          className={styles.chipButton}
                          type="button"
                          onClick={() => setConfirming(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className={styles.chipButton}
                        type="button"
                        onClick={() => setConfirming(member.id)}
                      >
                        {member.isYou ? 'Leave co-op' : 'Remove'}
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
            {team.invites.map((invite) => (
              <li className={styles.row} key={invite.id}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{invite.email}</span>
                  <span className={styles.rowMeta}>
                    Invited · expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </span>
                </span>
                <span className={styles.rowActions}>
                  <button
                    className={styles.chipButton}
                    type="button"
                    onClick={() => void cancelInvite(invite.id)}
                  >
                    <Trash2 aria-hidden="true" size={12} /> Cancel invite
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={base.muted}>Loading coordinators…</p>
        )}
        <form className={base.inlineForm} onSubmit={invite}>
          <label className={base.smallLabel} htmlFor="invite-email">
            Invite a co-coordinator by email
            <input
              id="invite-email"
              className={base.field}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={200}
              placeholder="name@example.com"
            />
          </label>
          <div className={base.buttonRow}>
            <button className={base.button} type="submit" disabled={sending}>
              <UserPlus aria-hidden="true" size={15} /> {sending ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export function SettingsPanel({ coopId, settings, onSettings, onLeft }: Props) {
  return (
    <div className={styles.grid2}>
      <div className={styles.stack}>
        <FamilyLinkCard coopId={coopId} settings={settings} onSettings={onSettings} />
        <CalendarCard key={coopId} coopId={coopId} settings={settings} onSettings={onSettings} />
      </div>
      <TeamCard coopId={coopId} onLeft={onLeft} />
    </div>
  );
}
