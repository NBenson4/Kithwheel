// Announcements tab: write to every family, one grade section, or the families taking one
// class; each family gets an email.
'use client';

import { Send } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import styles from '@/components/custom/coop/coop.module.css';
import { LoadState } from '@/components/custom/coop/families-panel';
import { errorMessage, formatTimestamp, post } from '@/components/custom/coop/shared';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import { type Announcement, AnnouncementList } from '@/lib/contracts/coop-features';
import type { SectionRecord } from '@/lib/contracts/coops';

type Props = { coopId: string; sections: SectionRecord[] };

export function AnnouncementsPanel({ coopId, sections }: Props) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  // "" = every family, "section:<id>" or "class:<id>".
  const [audience, setAudience] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setItems(
        (await apiFetch(`/api/coops/${coopId}/announcements`, { schema: AnnouncementList })).items,
      );
    } catch {
      setError(true);
    }
  }, [coopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const [kind, targetId] = audience.split(':');
  const classes = sections.flatMap((section) => section.classes);
  const selectedClass = kind === 'class' ? classes.find((item) => item.id === targetId) : undefined;
  const selectedSection =
    kind === 'section' ? sections.find((section) => section.id === targetId) : undefined;
  const audienceLabel = selectedClass
    ? `families taking ${selectedClass.name}`
    : selectedSection
      ? `families in ${selectedSection.name}`
      : 'every family';

  function insertMaterials() {
    if (!selectedClass?.materials) return;
    setBody(
      (current) =>
        `${current}${current ? '\n\n' : ''}Materials for ${selectedClass.name}:\n${selectedClass.materials}`,
    );
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSending(true);
    try {
      const result = await apiFetch(`/api/coops/${coopId}/announcements`, {
        ...post({
          title,
          body,
          sectionId: selectedSection?.id ?? null,
          classId: selectedClass?.id ?? null,
        }),
        schema: AnnouncementList,
      });
      setItems(result.items);
      const sent = result.items[0]?.recipientCount ?? 0;
      toast.success(
        sent ? `Sent to ${sent} ${sent === 1 ? 'family' : 'families'}` : 'Posted to family pages',
      );
      setTitle('');
      setBody('');
      setConfirming(false);
    } catch (err) {
      toast.error(errorMessage(err));
      setConfirming(false);
      void load();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.grid2} style={{ alignItems: 'start' }}>
      <section className={base.panel} aria-labelledby="compose-heading">
        <div className={base.panelHeader}>
          <h2 className={base.panelTitle} id="compose-heading">
            New announcement
          </h2>
        </div>
        <form className={styles.stack} onSubmit={send}>
          <label className={base.smallLabel} htmlFor="announcement-audience">
            Send to
            <select
              id="announcement-audience"
              className={base.select}
              value={audience}
              onChange={(event) => {
                setAudience(event.target.value);
                setConfirming(false);
              }}
            >
              <option value="">Every family</option>
              <optgroup label="A grade section">
                {sections.map((section) => (
                  <option key={section.id} value={`section:${section.id}`}>
                    Families in {section.name}
                  </option>
                ))}
              </optgroup>
              {sections
                .filter((section) => section.classes.length)
                .map((section) => (
                  <optgroup key={section.id} label={`One class · ${section.name}`}>
                    {section.classes.map((item) => (
                      <option key={item.id} value={`class:${item.id}`}>
                        Families taking {item.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </label>
          <label className={base.smallLabel} htmlFor="announcement-title">
            Subject
            <input
              id="announcement-title"
              className={base.field}
              value={title}
              required
              maxLength={150}
              onChange={(event) => {
                setTitle(event.target.value);
                setConfirming(false);
              }}
            />
          </label>
          <label className={base.smallLabel} htmlFor="announcement-body">
            Message
            <textarea
              id="announcement-body"
              className={styles.textarea}
              style={{ minHeight: 170 }}
              value={body}
              required
              maxLength={5000}
              onChange={(event) => {
                setBody(event.target.value);
                setConfirming(false);
              }}
            />
          </label>
          {selectedClass?.materials && (
            <div className={base.buttonRow}>
              <button className={styles.chipButton} type="button" onClick={insertMaterials}>
                Add {selectedClass.name}’s materials list
              </button>
            </div>
          )}
          <p className={base.muted}>
            Families get it by email (replies come to you) and it stays on their family page.
          </p>
          {confirming && (
            <p className={styles.note} role="alert">
              Send “{title}” to {audienceLabel}? Press send again to confirm.
            </p>
          )}
          <div className={base.buttonRow}>
            <button className={base.button} type="submit" disabled={sending}>
              <Send aria-hidden="true" size={14} />
              {sending ? 'Sending…' : confirming ? 'Yes, send it' : 'Send announcement'}
            </button>
            {confirming && (
              <button
                className={base.quietButton}
                type="button"
                onClick={() => setConfirming(false)}
              >
                Not yet
              </button>
            )}
          </div>
        </form>
      </section>

      <section className={base.panel} aria-labelledby="sent-heading">
        <div className={base.panelHeader}>
          <h2 className={base.panelTitle} id="sent-heading">
            Sent
          </h2>
          <span className={base.count}>{items?.length ?? '–'}</span>
        </div>
        {!items ? (
          <LoadState error={error} onRetry={() => void load()} />
        ) : items.length ? (
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id}>
                <details className={styles.details}>
                  <summary>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{item.title}</span>
                      <span className={styles.rowMeta}>
                        {formatTimestamp(item.createdAt)} ·{' '}
                        {item.className
                          ? `Families taking ${item.className}`
                          : item.sectionName
                            ? `Families in ${item.sectionName}`
                            : 'Every family'}{' '}
                        · {item.recipientCount} emailed
                      </span>
                    </span>
                  </summary>
                  <div className={styles.detailsBody}>
                    <p className={`${styles.prewrap} ${base.description}`} style={{ margin: 0 }}>
                      {item.body}
                    </p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className={base.muted}>No announcements yet.</p>
        )}
      </section>
    </div>
  );
}
