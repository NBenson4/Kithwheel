// The check-in tablet by the door: parents tap their child's name in the morning and at pickup.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import styles from '@/components/custom/coop/coop.module.css';
import { PublicMessage } from '@/components/custom/coop/public/public-parts';
import { errorMessage, formatClock, formatDay, post } from '@/components/custom/coop/shared';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import { KioskDay, type KioskDay as KioskDayType } from '@/lib/contracts/coop-features';

type Child = KioskDayType['children'][number];

export function KioskView({ token }: { token: string }) {
  const [day, setDay] = useState<KioskDayType | null>(null);
  const [failed, setFailed] = useState<'missing' | 'error' | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Child | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDay(await apiFetch(`/api/public/kiosk/${token}`, { schema: KioskDay }));
      setFailed(null);
    } catch (error) {
      const status = error instanceof Error ? /\((\d+)\)/.exec(error.message)?.[1] : undefined;
      setFailed(status === '404' ? 'missing' : 'error');
    }
  }, [token]);

  useEffect(() => {
    void load();
    // Keep the tablet current when a coordinator checks someone in from their phone.
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function act(child: Child, action: 'check_in' | 'check_out' | 'undo') {
    setBusy(true);
    try {
      setDay(
        await apiFetch(`/api/public/kiosk/${token}`, {
          ...post({ childId: child.childId, action }),
          schema: KioskDay,
        }),
      );
      toast.success(
        action === 'check_in'
          ? `Good morning, ${child.name}!`
          : action === 'check_out'
            ? `Bye, ${child.name}! See you next time.`
            : `${child.name}’s check-in was undone`,
      );
      setSelected(null);
      setQuery('');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (failed === 'missing') {
    return (
      <PublicMessage
        title="This check-in link isn’t working"
        body="A coordinator can create a new tablet link on the Check-in tab."
      />
    );
  }
  if (!day) {
    return (
      <main className={styles.kiosk}>
        <output className={base.loading}>{failed ? 'Reconnecting…' : 'Loading…'}</output>
      </main>
    );
  }

  const search = query.trim().toLowerCase();
  const children = search
    ? day.children.filter((child) =>
        `${child.name} ${child.familyName}`.toLowerCase().includes(search),
      )
    : day.children;
  const checkedIn = day.children.filter((child) => child.checkedInAt).length;

  return (
    <main className={styles.kiosk}>
      <header className={styles.kioskHeader}>
        <div>
          <p className={base.eyebrow}>{formatDay(day.date)}</p>
          <h1 className={styles.publicTitle}>{day.coopName} check-in</h1>
        </div>
        <span
          className={`${styles.pill} ${styles.pillGood}`}
          style={{ fontSize: 14, padding: '6px 12px' }}
        >
          {checkedIn} of {day.children.length} here
        </span>
      </header>

      {selected ? (
        <section
          className={styles.section}
          style={{ maxWidth: 520, margin: '40px auto' }}
          aria-live="polite"
        >
          <h2 className={styles.sectionTitle} style={{ fontSize: 26 }}>
            {selected.name}
          </h2>
          <p className={base.description} style={{ margin: 0 }}>
            Checked in at {formatClock(selected.checkedInAt)}
            {selected.checkedOutAt ? ` · picked up at ${formatClock(selected.checkedOutAt)}` : ''}
          </p>
          <div className={base.buttonRow}>
            {!selected.checkedOutAt && (
              <button
                className={base.button}
                style={{ minHeight: 54, fontSize: 17 }}
                type="button"
                disabled={busy}
                onClick={() => void act(selected, 'check_out')}
              >
                Check out for pickup
              </button>
            )}
            <button
              className={base.quietButton}
              style={{ minHeight: 54 }}
              type="button"
              disabled={busy}
              onClick={() => void act(selected, 'undo')}
            >
              Undo check-in
            </button>
            <button
              className={base.quietButton}
              style={{ minHeight: 54 }}
              type="button"
              onClick={() => setSelected(null)}
            >
              Back
            </button>
          </div>
        </section>
      ) : (
        <>
          <input
            className={styles.kioskSearch}
            type="search"
            placeholder="Type your child’s name"
            aria-label="Find your child"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {children.length ? (
            <div className={styles.kioskGrid}>
              {children.map((child) => {
                const isIn = Boolean(child.checkedInAt);
                return (
                  <button
                    key={child.childId}
                    type="button"
                    className={`${styles.kioskCard} ${isIn ? styles.kioskIn : ''}`}
                    disabled={busy}
                    onClick={() => (isIn ? setSelected(child) : void act(child, 'check_in'))}
                  >
                    <span className={styles.kioskName}>{child.name}</span>
                    <span className={styles.rowMeta}>{child.familyName}</span>
                    <span className={styles.rowMeta}>
                      {child.checkedOutAt
                        ? `Picked up ${formatClock(child.checkedOutAt)}`
                        : isIn
                          ? `Here since ${formatClock(child.checkedInAt)} · tap at pickup`
                          : 'Tap to check in'}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className={base.description}>
              {day.children.length ? 'No one by that name.' : 'No children are registered yet.'}
            </p>
          )}
        </>
      )}
    </main>
  );
}
