// Import classes from a spreadsheet: paste CSV or choose a .csv file, preview, then import.
'use client';

import { FileUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import styles from '@/components/custom/coop/coop.module.css';
import { downloadCsv, errorMessage, post } from '@/components/custom/coop/shared';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import { ImportResult } from '@/lib/contracts/coop-features';
import { previewClassImport } from '@/lib/coop/csv';
import { formatMoney } from '@/lib/coop/money';

type Props = {
  coopId: string;
  sectionId: string;
  sectionName: string;
  onImported: () => Promise<void> | void;
  onClose: () => void;
};

export function ClassImport({ coopId, sectionId, sectionName, onImported, onClose }: Props) {
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const preview = text.trim() ? previewClassImport(text) : null;

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) {
      toast.error('That file is too large. Save it as a CSV with just the classes.');
      return;
    }
    setText(await file.text());
  }

  async function runImport() {
    if (!preview?.rows.length) return;
    setImporting(true);
    try {
      const result = await apiFetch(`/api/coops/${coopId}/classes/import`, {
        ...post({ sectionId, classes: preview.rows }),
        schema: ImportResult,
      });
      toast.success(`${result.created} ${result.created === 1 ? 'class' : 'classes'} imported`);
      setText('');
      await onImported();
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className={base.inlineForm}>
      <strong className={styles.rowTitle}>Import classes from a spreadsheet</strong>
      <p className={base.muted} style={{ margin: 0 }}>
        Save your sheet as CSV (File → Download → CSV in Google Sheets, or Save As → CSV in Excel),
        or copy the cells and paste them below. The first row needs column names: Name, plus any of
        Section, Description, Teacher, Room, Time, Capacity, Fee, Materials. Rows without a Section
        go to {sectionName}.
      </p>
      <div className={base.buttonRow}>
        <label className={base.quietButton}>
          <FileUp aria-hidden="true" size={14} /> Choose a CSV file
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
        </label>
        <button
          className={styles.chipButton}
          type="button"
          onClick={() =>
            downloadCsv('kithwheel-classes-template.csv', [
              [
                'Section',
                'Name',
                'Description',
                'Teacher',
                'Room',
                'Time',
                'Capacity',
                'Fee',
                'Materials',
              ],
              [
                '2nd grade',
                'Nature Journaling',
                'Sketching outdoors',
                'Ms. Rivera',
                'Room 2',
                '9:00-9:50',
                12,
                15,
                'Sketchbook, colored pencils',
              ],
            ])
          }
        >
          Download a template
        </button>
      </div>
      <label className={base.smallLabel} htmlFor="class-import-text">
        Or paste here
        <textarea
          id="class-import-text"
          className={styles.textarea}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            'Name,Teacher,Room,Time,Capacity\nNature Journaling,Ms. Rivera,Room 2,9:00-9:50,12'
          }
        />
      </label>
      {preview && (
        <div className={styles.stack} style={{ gap: 8 }}>
          {preview.problems.map((problem) => (
            <p className={styles.note} key={`${problem.row}-${problem.message}`}>
              Row {problem.row}: {problem.message}
            </p>
          ))}
          {preview.rows.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Class</th>
                    <th>Teacher</th>
                    <th>Time</th>
                    <th className={styles.num}>Seats</th>
                    <th className={styles.num}>Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((row, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: preview rows have no ids.
                    <tr key={index}>
                      <td>{row.section || sectionName}</td>
                      <td>{row.name}</td>
                      <td>{row.teacher ?? ''}</td>
                      <td>{row.time ?? ''}</td>
                      <td className={styles.num}>{row.capacity ?? '—'}</td>
                      <td className={styles.num}>
                        {row.feeCents ? formatMoney(row.feeCents) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <div className={base.buttonRow}>
        <button
          className={base.button}
          type="button"
          disabled={importing || !preview?.rows.length}
          onClick={() => void runImport()}
        >
          {importing
            ? 'Importing…'
            : preview?.rows.length
              ? `Import ${preview.rows.length} ${preview.rows.length === 1 ? 'class' : 'classes'}`
              : 'Import'}
        </button>
        <button className={base.quietButton} type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
