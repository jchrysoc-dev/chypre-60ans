import { describe, expect, it } from 'vitest';
import { byName, cyprusDateTime, cyprusDay, formatDate, formatEuros, formatTimeRange, orTbd } from '../src/lib/format';

describe('format', () => {
  it('formats calendar dates without time-zone drift', () => {
    expect(formatDate('2027-05-29')).toBe('Saturday 29 May 2027');
  });

  it('shows times in Cyprus time regardless of the offset written', () => {
    expect(formatTimeRange('2027-05-29T16:00Z', '2027-05-29T20:30+03:00')).toBe('19:00 – 20:30');
  });

  it('assigns late-night activities to the Cyprus calendar day', () => {
    expect(cyprusDay('2027-05-29T23:30+03:00')).toBe('2027-05-29');
    expect(cyprusDay('2027-05-29T22:30Z')).toBe('2027-05-30');
  });

  it('formats euros and free activities', () => {
    expect(formatEuros(0)).toBe('Free');
    expect(formatEuros(45)).toBe('€45');
    expect(formatEuros(12.5)).toBe('€12.50');
  });

  it('shows "To be confirmed" for TBD', () => {
    expect(orTbd('TBD', String)).toBe('To be confirmed');
  });

  it('writes timestamps for spreadsheets in Cyprus time', () => {
    expect(cyprusDateTime('2027-05-27T07:00:00+00:00')).toBe('2027-05-27 10:00');
    expect(cyprusDateTime(null)).toBe('');
  });
});

describe('byName', () => {
  it('sorts numbers and accents naturally', () => {
    expect(['Guest 10', 'guest 2', 'Émile', 'Eva'].sort(byName)).toEqual(['Émile', 'Eva', 'guest 2', 'Guest 10']);
  });
});
