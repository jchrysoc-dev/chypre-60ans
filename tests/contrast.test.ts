/** Every text/background colour pair used in the site meets WCAG AA (4.5:1 for normal text). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf-8');
const color = (name: string) => {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!match) throw new Error(`--color-${name} not found`);
  return match[1];
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const pairs: [string, string, string][] = [
  ['ink on linen', color('ink'), color('linen')],
  ['ink on paper', color('ink'), color('paper')],
  ['ink-soft on linen', color('ink-soft'), color('linen')],
  ['ink-soft on paper', color('ink-soft'), color('paper')],
  ['sea links on linen', color('sea'), color('linen')],
  ['sea links on paper', color('sea'), color('paper')],
  ['paper on sea button', color('paper'), color('sea')],
  ['paper on sea-deep button', color('paper'), color('sea-deep')],
  ['clay times on linen', color('clay'), color('linen')],
  ['clay date on paper', color('clay'), color('paper')],
  ['olive on linen', color('olive'), color('linen')],
];

describe('WCAG AA contrast', () => {
  it.each(pairs)('%s ≥ 4.5:1', (_label, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
