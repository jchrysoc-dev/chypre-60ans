/**
 * CSV files for the organisers, made to open cleanly in Excel and Google Sheets.
 */
import { cyprusDay } from './format';

type Cell = string | number | boolean | null | undefined;

/** A cell starting with one of these could be run as a formula by a spreadsheet. */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value);
  // Guests type their own names and notes: never let one become a spreadsheet formula.
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Header row plus data rows, with Windows line endings and a byte-order mark so Excel
 * reads accents (é, ü, Greek letters) correctly.
 */
export function toCsv(header: string[], rows: Cell[][]): string {
  return '﻿' + [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** A download response, e.g. activity-signups-2027-05-20.csv (dated in Cyprus). */
export function csvResponse(name: string, body: string, today = new Date()): Response {
  const date = cyprusDay(today.toISOString());
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-${date}.csv"`,
    },
  });
}
