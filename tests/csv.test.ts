import { describe, expect, it } from 'vitest';
import { csvResponse, toCsv } from '../src/lib/csv';

describe('toCsv', () => {
  it('starts with a byte-order mark and uses Windows line endings, for Excel', () => {
    expect(toCsv(['a', 'b'], [[1, 2]])).toBe('﻿a,b\r\n1,2\r\n');
  });

  it('quotes commas, quotes and line breaks, and keeps accents', () => {
    const csv = toCsv(['name', 'note'], [['Zoë Παπαδοπούλου', 'Nuts, "all" kinds\nand gluten']]);
    expect(csv).toContain('Zoë Παπαδοπούλου,"Nuts, ""all"" kinds\nand gluten"');
  });

  it('never lets a guest-typed value become a spreadsheet formula', () => {
    const csv = toCsv(['name'], [['=HYPERLINK("http://evil")'], ['+1'], ['-x'], ['@SUM(A1)']]);
    expect(csv.split('\r\n').slice(1, 5)).toEqual(["\"'=HYPERLINK(\"\"http://evil\"\")\"", "'+1", "'-x", "'@SUM(A1)"]);
  });

  it('writes yes/no for true/false and leaves empty values blank', () => {
    expect(toCsv(['a', 'b', 'c'], [[true, null, undefined]])).toBe('﻿a,b,c\r\nyes,,\r\n');
  });
});

describe('csvResponse', () => {
  it('downloads with a file name dated in Cyprus', () => {
    const response = csvResponse('replies', 'x', new Date('2027-05-20T22:30Z')); // 01:30 on the 21st in Cyprus
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="replies-2027-05-21.csv"');
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
  });
});
