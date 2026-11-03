// "Getting started" checklist shown above the workspace until the co-op is set up.
'use client';

import { CheckCircle2, Circle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import styles from '@/components/custom/coop/coop.module.css';
import base from '@/components/custom/scheduling/scheduling.module.css';
import type { CoopSettings } from '@/lib/contracts/coop-features';

export type WorkspaceTab =
  | 'schedule'
  | 'families'
  | 'checkin'
  | 'announcements'
  | 'volunteer'
  | 'fees'
  | 'settings';

type Props = {
  coopId: string;
  settings: CoopSettings;
  onGo: (tab: WorkspaceTab) => void;
};

const storageKey = (coopId: string) => `kithwheel:checklist-hidden:${coopId}`;

export function SetupChecklist({ coopId, settings, onGo }: Props) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(storageKey(coopId)) === '1');
    } catch {
      setHidden(false);
    }
  }, [coopId]);

  const items: { label: string; done: boolean; tab: WorkspaceTab }[] = [
    {
      label: 'Add classes to your grade sections',
      done: settings.counts.classes > 0,
      tab: 'schedule',
    },
    {
      label: 'Approve each section’s schedule',
      done:
        settings.sectionsWithClasses > 0 &&
        settings.sectionsApproved === settings.sectionsWithClasses,
      tab: 'schedule',
    },
    { label: 'Create the family link', done: settings.shareUrl !== null, tab: 'settings' },
    {
      label: 'Set the co-op day for calendars',
      done:
        settings.meetingDay !== null && settings.termStart !== null && settings.termEnd !== null,
      tab: 'settings',
    },
    {
      label: 'Set fees',
      done:
        settings.familyFeeCents > 0 || settings.childFeeCents > 0 || settings.counts.classFees > 0,
      tab: 'fees',
    },
    {
      label: 'Open registration',
      done: settings.registrationOpen || settings.counts.families > 0,
      tab: 'families',
    },
    {
      label: 'Invite a co-coordinator',
      done: settings.counts.coordinators > 1 || settings.counts.pendingInvites > 0,
      tab: 'settings',
    },
  ];
  const doneCount = items.filter((item) => item.done).length;
  if (hidden || doneCount === items.length) return null;

  return (
    <section className={styles.checklist} aria-labelledby="checklist-heading">
      <div className={base.panelHeader} style={{ marginBottom: 0 }}>
        <div>
          <h2 className={base.panelTitle} id="checklist-heading">
            Getting your co-op set up
          </h2>
          <p className={base.muted} style={{ margin: '4px 0 0' }}>
            {doneCount} of {items.length} done
            {settings.counts.classes === 0 ? ' · start with your classes' : ''}
          </p>
        </div>
        <button
          className={styles.chipButton}
          type="button"
          aria-label="Hide the setup checklist"
          onClick={() => {
            setHidden(true);
            try {
              window.localStorage.setItem(storageKey(coopId), '1');
            } catch {
              // Hiding still works for this visit.
            }
          }}
        >
          <X aria-hidden="true" size={13} /> Hide
        </button>
      </div>
      <div className={styles.progress} aria-hidden="true">
        <div
          className={styles.progressBar}
          style={{ width: `${(doneCount / items.length) * 100}%` }}
        />
      </div>
      <ul className={styles.checklistItems}>
        {items.map((item) => (
          <li key={item.label}>
            <button className={styles.checkItem} type="button" onClick={() => onGo(item.tab)}>
              {item.done ? (
                <CheckCircle2 aria-hidden="true" size={17} color="var(--primary)" />
              ) : (
                <Circle aria-hidden="true" size={17} color="#9aa59b" />
              )}
              <span className={item.done ? styles.checkDone : undefined}>{item.label}</span>
              <span className="sr-only">{item.done ? '(done)' : '(to do)'}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
