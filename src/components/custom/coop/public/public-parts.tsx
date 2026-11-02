// Pieces shared by the family-facing pages: header, schedule, class card, calendar links.
'use client';

import { CalendarPlus, Printer } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from '@/components/custom/coop/coop.module.css';
import base from '@/components/custom/scheduling/scheduling.module.css';
import type { PublicClass, PublicSchedule } from '@/lib/contracts/coop-features';
import { formatMoney } from '@/lib/coop/money';

export function PublicHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className={styles.publicHeader}>
      <div>
        <Link href="/" className={`${styles.publicBrand} ${styles.noPrint}`}>
          Kithwheel
        </Link>
        <p className={base.eyebrow}>{eyebrow}</p>
        <h1 className={styles.publicTitle}>{title}</h1>
      </div>
      {children && <div className={`${base.buttonRow} ${styles.noPrint}`}>{children}</div>}
    </header>
  );
}

export function PrintButton() {
  return (
    <button className={base.quietButton} type="button" onClick={() => window.print()}>
      <Printer aria-hidden="true" size={15} /> Print or save as PDF
    </button>
  );
}

export function CalendarLinks({ url }: { url: string }) {
  const webcal = url.replace(/^https?:/, 'webcal:');
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  return (
    <details className={`${styles.details} ${styles.noPrint}`}>
      <summary>
        <span
          className={styles.rowTitle}
          style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}
        >
          <CalendarPlus aria-hidden="true" size={16} /> Add to your calendar
        </span>
      </summary>
      <div className={styles.detailsBody}>
        <p className={base.muted} style={{ margin: 0 }}>
          Subscribe once and schedule changes show up on their own.
        </p>
        <div className={base.buttonRow}>
          <a className={base.quietButton} href={google} target="_blank" rel="noreferrer">
            Google Calendar
          </a>
          <a className={base.quietButton} href={webcal}>
            Apple or Outlook
          </a>
          <a className={base.quietButton} href={url} download>
            Download .ics file
          </a>
        </div>
      </div>
    </details>
  );
}

export function ClassCard({ item, extra }: { item: PublicClass; extra?: ReactNode }) {
  const facts = [item.time, item.room, item.teacher].filter(Boolean).join(' · ');
  return (
    <div className={styles.classCard}>
      <span className={styles.rowTitle}>{item.name}</span>
      {facts && <span className={styles.rowMeta}>{facts}</span>}
      {item.description && <span className={styles.rowMeta}>{item.description}</span>}
      {item.materials && (
        <span className={`${styles.rowMeta} ${styles.prewrap}`}>
          <strong>Materials:</strong> {item.materials}
        </span>
      )}
      {(item.feeCents > 0 || item.capacity !== null) && (
        <span className={styles.rowMeta}>
          {item.feeCents > 0 ? `Class fee ${formatMoney(item.feeCents)}` : ''}
          {item.feeCents > 0 && item.capacity !== null ? ' · ' : ''}
          {item.capacity !== null
            ? item.seatsLeft
              ? `${item.seatsLeft} ${item.seatsLeft === 1 ? 'seat' : 'seats'} left`
              : `Full${item.waitlisted ? ` · ${item.waitlisted} on the waitlist` : ' · waitlist open'}`
            : ''}
        </span>
      )}
      {extra}
    </div>
  );
}

export function ScheduleView({ schedule }: { schedule: PublicSchedule }) {
  return (
    <div className={styles.rotationGrid}>
      {schedule.rotations.map((rotation, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rotations are ordered and have no public id.
        <div className={styles.rotationCard} key={index}>
          <h3 className={styles.groupTitle} style={{ margin: 0 }}>
            {rotation.ageGroup}
          </h3>
          {rotation.classes.map((item) => (
            <ClassCard key={item.id} item={item} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PublicMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className={styles.publicPage}>
      <section className={base.emptyState}>
        <h1 className={base.emptyTitle}>{title}</h1>
        <p className={base.description}>{body}</p>
      </section>
    </main>
  );
}
