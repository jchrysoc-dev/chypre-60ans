/**
 * Checks everything in content/ and explains any problem in plain English.
 * Runs first in `npm run build` (so Vercel enforces it too) and as part of `npm run check`.
 *
 *   node scripts/check-content.ts          check and report
 *   node scripts/check-content.ts --done   print the "all good" line (used at the end of `npm run check`)
 *
 * Needs no secrets. What the checks are: scripts/content-checks.ts
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { checkContent, type ContentFile } from './content-checks.ts';

const root = new URL('../', import.meta.url);

if (process.argv.includes('--done')) {
  console.log('\nEverything looks good. Your changes are ready to publish.');
  process.exit(0);
}

const contentDir = new URL('content/', root);
const files: ContentFile[] = (readdirSync(contentDir, { recursive: true }) as string[])
  .map((name) => `content/${name.replace(/\\/g, '/')}`)
  .filter((path) => /\.(md|ya?ml)$/.test(path) && !path.startsWith('content/photos/originals/'))
  .map((path) => ({ path, text: readFileSync(new URL(path, root), 'utf-8') }));

const sizesFile = new URL('public/photos/sizes.json', root);
const photoSizes = existsSync(sizesFile) ? JSON.parse(readFileSync(sizesFile, 'utf-8')) : {};
const imageFiles = new Set(existsSync(new URL('public/photos/', root)) ? readdirSync(new URL('public/photos/', root)) : []);

const { problems, todo, checked } = checkContent(files, photoSizes, imageFiles);

if (problems.length) {
  console.error('\nSomething in the content needs fixing. Nothing has been published.\n');
  for (const { file, message } of problems) console.error(`  ${file}\n    ${message}\n`);
  console.error(`${problems.length} problem${problems.length > 1 ? 's' : ''} found in ${checked} files.`);
  process.exit(1);
}

console.log(`Content checked: ${checked} files, no problems.`);
if (todo.length) {
  console.log('\nStill to fill in (nothing is broken, this will not stop publishing):');
  for (const line of todo) console.log(`  - ${line}`);
}
