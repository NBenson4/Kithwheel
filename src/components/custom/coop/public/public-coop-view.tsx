// The co-op's family link: approved section schedules, print, calendar, and registration.
'use client';

import { Plus } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import styles from '@/components/custom/coop/coop.module.css';
import {
  CalendarLinks,
  PrintButton,
  PublicHeader,
  PublicMessage,
  ScheduleView,
} from '@/components/custom/coop/public/public-parts';
import { errorMessage, post, WEEKDAYS } from '@/components/custom/coop/shared';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import {
  PublicCoop,
  type PublicCoop as PublicCoopType,
  type PublicSchedule,
  RegistrationResult,
} from '@/lib/contracts/coop-features';
import { formatMoney } from '@/lib/coop/money';

type ChildDraft = { name: string; grade: string };
const emptyChild = (): ChildDraft => ({ name: '', grade: '' });

type Done = { kind: 'registered' | 'already' };

function RegistrationForm({ token, coop }: { token: string; coop: PublicCoopType }) {
  const [parentName, setParentName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [children, setChildren] = useState<ChildDraft[]>([emptyChild()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  function updateChild(index: number, next: ChildDraft) {
    setChildren(children.map((child, i) => (i === index ? next : child)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch(`/api/public/coops/${token}/register`, {
        ...post({
          parentName,
          email,
          phone,
          website,
          children: children.map((child) => ({ name: child.name, grade: child.grade })),
        }),
        schema: RegistrationResult,
      });
      setDone({ kind: result.status === 'registered' ? 'registered' : 'already' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <section className={styles.section} aria-live="polite">
        <h2 className={styles.sectionTitle}>
          {done.kind === 'registered' ? 'You’re registered!' : 'You’re already registered'}
        </h2>
        {done.kind === 'registered' ? (
          <>
            <p className={base.description}>
              Your coordinators will place each child in their grade’s classes and let you know.
            </p>
            <p className={base.description}>
              We emailed {email} a private link to your family page, with your classes, materials,
              fees and volunteer hours. If it doesn’t arrive in a few minutes, check spam.
            </p>
          </>
        ) : (
          <p className={base.description}>
            We emailed the link to your family page to {email} again. From there you can see your
            children’s classes or add another child.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className={`${styles.section} ${styles.noPrint}`} aria-labelledby="register-heading">
      <h2 className={styles.sectionTitle} id="register-heading">
        Register your family
      </h2>
      {coop.registration.note && (
        <p className={`${styles.note} ${styles.prewrap}`}>{coop.registration.note}</p>
      )}
      {(coop.fees.familyFeeCents > 0 || coop.fees.childFeeCents > 0) && (
        <p className={base.muted} style={{ margin: 0 }}>
          Fees:{' '}
          {[
            coop.fees.familyFeeCents ? `${formatMoney(coop.fees.familyFeeCents)} per family` : '',
            coop.fees.childFeeCents ? `${formatMoney(coop.fees.childFeeCents)} per child` : '',
          ]
            .filter(Boolean)
            .join(' + ')}
          , plus any class fees listed below.
        </p>
      )}
      <form className={styles.stack} onSubmit={submit}>
        <div className={styles.grid3}>
          <label className={base.smallLabel} htmlFor="reg-parent">
            Parent or guardian name
            <input
              id="reg-parent"
              className={base.field}
              value={parentName}
              required
              maxLength={120}
              autoComplete="name"
              onChange={(event) => setParentName(event.target.value)}
            />
          </label>
          <label className={base.smallLabel} htmlFor="reg-email">
            Email
            <input
              id="reg-email"
              className={base.field}
              type="email"
              value={email}
              required
              maxLength={200}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className={base.smallLabel} htmlFor="reg-phone">
            Phone (optional)
            <input
              id="reg-phone"
              className={base.field}
              type="tel"
              value={phone}
              maxLength={40}
              autoComplete="tel"
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
        </div>
        <div className={styles.honeypot} aria-hidden="true">
          <label>
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </label>
        </div>

        {children.map((child, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: children are edited in place by position.
          <fieldset className={styles.childCard} key={index} style={{ margin: 0 }}>
            <legend className={styles.rowTitle} style={{ padding: '0 4px' }}>
              Child {index + 1}
            </legend>
            <div className={base.optionalGrid}>
              <label className={base.smallLabel} htmlFor={`reg-child-${index}`}>
                Name
                <input
                  id={`reg-child-${index}`}
                  className={base.field}
                  value={child.name}
                  required
                  maxLength={120}
                  onChange={(event) => updateChild(index, { ...child, name: event.target.value })}
                />
              </label>
              <label className={base.smallLabel} htmlFor={`reg-grade-${index}`}>
                Grade
                <select
                  id={`reg-grade-${index}`}
                  className={base.select}
                  value={child.grade}
                  required
                  onChange={(event) => updateChild(index, { ...child, grade: event.target.value })}
                >
                  <option value="">Choose…</option>
                  {coop.grades.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {children.length > 1 && (
              <div className={base.buttonRow}>
                <button
                  className={styles.chipButton}
                  type="button"
                  onClick={() => setChildren(children.filter((_, i) => i !== index))}
                >
                  Remove this child
                </button>
              </div>
            )}
          </fieldset>
        ))}
        <p className={base.muted} style={{ margin: 0 }}>
          Your coordinators place each child in their grade’s section and classes.
        </p>
        <div className={base.buttonRow}>
          <button
            className={base.quietButton}
            type="button"
            disabled={children.length >= 12}
            onClick={() => setChildren([...children, emptyChild()])}
          >
            <Plus aria-hidden="true" size={14} /> Add another child
          </button>
        </div>
        {error && (
          <p className={base.error} role="alert">
            {error}
          </p>
        )}
        <div className={base.buttonRow}>
          <button className={base.button} type="submit" disabled={submitting}>
            {submitting ? 'Registering…' : 'Register'}
          </button>
        </div>
        <p className={base.muted} style={{ margin: 0 }}>
          Your details go only to {coop.name}’s coordinators.
        </p>
      </form>
    </section>
  );
}

export function PublicCoopView({ token }: { token: string }) {
  const [coop, setCoop] = useState<PublicCoopType | null>(null);
  const [failed, setFailed] = useState<'missing' | 'error' | null>(null);

  const load = useCallback(async () => {
    try {
      setCoop(await apiFetch(`/api/public/coops/${token}`, { schema: PublicCoop }));
    } catch (error) {
      const status = error instanceof Error ? /\((\d+)\)/.exec(error.message)?.[1] : undefined;
      setFailed(status === '404' ? 'missing' : 'error');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed === 'missing') {
    return (
      <PublicMessage
        title="This link isn’t working"
        body="It may have been replaced. Ask your co-op coordinator for the current link."
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
  if (!coop) {
    return (
      <main className={styles.publicPage}>
        <output className={base.loading}>Loading…</output>
      </main>
    );
  }

  return (
    <main className={styles.publicPage}>
      <PublicHeader eyebrow="Co-op schedules" title={coop.name}>
        {coop.schedule.sections.length > 0 && <PrintButton />}
        {coop.registration.open && (
          <a className={base.button} href="#register-heading">
            Register
          </a>
        )}
      </PublicHeader>
      {coop.meetingDay !== null && (
        <p className={base.muted}>Co-op meets on {WEEKDAYS[coop.meetingDay]}s.</p>
      )}
      {coop.calendarUrl && <CalendarLinks url={coop.calendarUrl} />}
      <section className={styles.section} aria-labelledby="schedule-heading">
        <h2 className={styles.sectionTitle} id="schedule-heading">
          Schedules by grade
        </h2>
        <ScheduleView schedule={coop.schedule} />
      </section>
      {coop.registration.open && <RegistrationForm token={token} coop={coop} />}
      <p className={`${styles.footerNote} ${styles.noPrint}`}>
        Shared with Kithwheel, the co-op organizer.
      </p>
    </main>
  );
}
