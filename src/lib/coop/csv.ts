// Spreadsheet import: a small RFC 4180 CSV reader plus the mapping from columns to
// class fields. Runs in the browser so coordinators see a preview before importing.
import { dollarsToCents } from '@/lib/coop/money';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',' || char === '\t') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

export type ImportedClass = {
  section?: string;
  name: string;
  description?: string;
  teacher?: string;
  room?: string;
  time?: string;
  capacity?: number | null;
  feeCents?: number;
  materials?: string;
};

export type ImportPreview = {
  rows: ImportedClass[];
  /** Problems by 1-based spreadsheet row number. */
  problems: { row: number; message: string }[];
  /** Columns that were recognised, for the preview header. */
  columns: string[];
};

const COLUMN_ALIASES: Record<string, keyof ImportedClass> = {
  section: 'section',
  grade: 'section',
  'age group': 'section',
  name: 'name',
  class: 'name',
  'class name': 'name',
  title: 'name',
  description: 'description',
  details: 'description',
  teacher: 'teacher',
  instructor: 'teacher',
  room: 'room',
  location: 'room',
  time: 'time',
  'class time': 'time',
  capacity: 'capacity',
  seats: 'capacity',
  'max students': 'capacity',
  fee: 'feeCents',
  'class fee': 'feeCents',
  'supply fee': 'feeCents',
  cost: 'feeCents',
  materials: 'materials',
  supplies: 'materials',
  'materials list': 'materials',
};

export const MAX_IMPORT_ROWS = 200;

export function previewClassImport(text: string): ImportPreview {
  const rows = parseCsv(text);
  const header = rows[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
  const mapping = header.map((cell) => COLUMN_ALIASES[cell] ?? null);
  const problems: ImportPreview['problems'] = [];
  if (!mapping.includes('name')) {
    return {
      rows: [],
      problems: [{ row: 1, message: 'Add a header row with a “Name” or “Class” column.' }],
      columns: [],
    };
  }

  const imported: ImportedClass[] = [];
  rows.slice(1, MAX_IMPORT_ROWS + 1).forEach((cells, offset) => {
    const rowNumber = offset + 2;
    const item: ImportedClass = { name: '' };
    mapping.forEach((key, column) => {
      const value = (cells[column] ?? '').trim();
      if (!key || value === '') return;
      if (key === 'capacity') {
        const seats = Number(value);
        if (Number.isInteger(seats) && seats > 0 && seats <= 1000) item.capacity = seats;
        else
          problems.push({ row: rowNumber, message: `Capacity “${value}” isn’t a whole number.` });
      } else if (key === 'feeCents') {
        const cents = dollarsToCents(value);
        if (cents !== null && cents >= 0) item.feeCents = cents;
        else problems.push({ row: rowNumber, message: `Fee “${value}” isn’t an amount.` });
      } else item[key] = value;
    });
    if (!item.name) {
      problems.push({
        row: rowNumber,
        message: 'This row has no class name, so it will be skipped.',
      });
      return;
    }
    imported.push(item);
  });
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    problems.push({
      row: MAX_IMPORT_ROWS + 2,
      message: `Only the first ${MAX_IMPORT_ROWS} classes are imported at a time.`,
    });
  }
  const columns = [...new Set(mapping.filter((key): key is keyof ImportedClass => key !== null))];
  return { rows: imported, problems, columns };
}
