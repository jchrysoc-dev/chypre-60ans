/**
 * Human-friendly formatting of content values. All times are shown in Cyprus time,
 * whatever the visitor's device time zone is.
 */
import { TBD } from './content-schemas';

const TIME_ZONE = 'Europe/Nicosia';
const LOCALE = 'en-GB';
export const TO_BE_CONFIRMED = 'To be confirmed';

export const isTbd = (value: unknown): value is typeof TBD => value === TBD;

/** "TBD" → "To be confirmed"; anything else passes through the formatter. */
export function orTbd<T>(value: T | typeof TBD, format: (value: T) => string): string {
  return isTbd(value) ? TO_BE_CONFIRMED : format(value);
}

/** 2027-05-29 → "Saturday 29 May 2027". Date-only values are calendar days, so use UTC to avoid shifting. */
export function formatDate(isoDate: string): string {
  // Assembled from parts so punctuation doesn't change between Node/ICU versions.
  const parts = new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(new Date(`${isoDate}T00:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`;
}

/** 2027-05-29T19:00+03:00 → "19:00" (Cyprus time). */
export function formatTime(isoDateTime: string): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE }).format(
    new Date(isoDateTime),
  );
}

/** 2027-05-29T19:00+03:00 → "2027-05-29" (the Cyprus calendar day). */
export function cyprusDay(isoDateTime: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(isoDateTime));
}

export function formatTimeRange(start: string, end?: string): string {
  return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
}

export function formatEuros(amount: number): string {
  if (amount === 0) return 'Free';
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}
