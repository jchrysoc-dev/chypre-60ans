/**
 * Prepares every photo listed in content/photos/*.yaml: downloads it from Unsplash (unsplash_id),
 * or reads your own picture from content/photos/originals/ (source_file), crops it to its
 * "aspect" around its "focus", and writes compressed WebP files to public/photos/.
 * Each file is kept under 200 KB, because guests are often on a phone on mobile data.
 * The WebP files carry no camera or location data (sharp drops it), so nothing private is published.
 *
 * Run from the project root:  npm run photos   (same as: node scripts/fetch-photos.mjs)
 * Existing files are skipped. Add --force to rebuild them all.
 * Also writes public/photos/sizes.json, the list of sizes each photo has.
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { parse as parseYaml } from 'yaml';

const WIDTHS = [480, 800, 1280, 1920];
const MAX_BYTES = 200 * 1024;
const MIN_QUALITY = 55;
const SOURCE_WIDTH = 2400;

const force = process.argv.includes('--force');
const contentDir = new URL('../content/photos/', import.meta.url);
const originalsDir = new URL('../content/photos/originals/', import.meta.url);
const outDir = new URL('../public/photos/', import.meta.url);
await mkdir(outDir, { recursive: true });

/** Unsplash's image server sometimes answers 503 for a moment, so try a few times. */
async function download(address, id) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(address);
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (attempt === 4) throw new Error(`${id}: Unsplash answered ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
}

const exists = (url) => stat(url).then(() => true, () => false);

// Sizes made earlier (the widths that did not fit in 200 KB are left out on purpose).
const known = await readFile(new URL('sizes.json', outDir), 'utf-8').then(JSON.parse, () => ({}));

const ids = (await readdir(contentDir))
  .filter((name) => name.endsWith('.yaml') && !name.startsWith('_'))
  .map((name) => name.replace(/\.yaml$/, ''))
  .sort();

for (const id of ids) {
  const photo = parseYaml(await readFile(new URL(`${id}.yaml`, contentDir), 'utf-8'));
  const madeBefore = known[id]?.length && (await Promise.all(known[id].map((w) => exists(new URL(`${id}-${w}.webp`, outDir))))).every(Boolean);
  if (!force && madeBefore) {
    console.log(`${id}: already there`);
    continue;
  }

  let original;
  if (photo.source_file) {
    const path = new URL(photo.source_file, originalsDir);
    if (!(await exists(path))) {
      console.error(`${id}: the picture "${photo.source_file}" is not in content/photos/originals/. Put it there and try again.`);
      process.exitCode = 1;
      continue;
    }
    original = await readFile(path);
  } else {
    original = await download(`https://images.unsplash.com/${photo.unsplash_id}?w=${SOURCE_WIDTH}&q=85&fm=jpg`, id);
  }

  // Crop to the wanted shape, keeping the "focus" point of the picture in view.
  // Phone photos are often stored sideways with a "rotate me" note: turn them the right way up first.
  original = await sharp(original).rotate().toBuffer();
  const { width, height } = await sharp(original).metadata();
  const [aw, ah] = photo.aspect.split(':').map(Number);
  const [fx, fy] = photo.focus.split(' ').map((v) => parseFloat(v) / 100);
  let cropW = width;
  let cropH = Math.round((width * ah) / aw);
  if (cropH > height) {
    cropH = height;
    cropW = Math.round((height * aw) / ah);
  }
  const cropped = await sharp(original)
    .extract({
      left: Math.round((width - cropW) * fx),
      top: Math.round((height - cropH) * fy),
      width: cropW,
      height: cropH,
    })
    .toBuffer();

  for (const w of WIDTHS) {
    if (w > cropW) continue;
    // Lower the quality until the file fits. If it only fits at a poor quality, skip this
    // width: the browser then uses the next size down, which looks better than a smudgy big one.
    let quality = 80;
    let output = await sharp(cropped).resize({ width: w }).webp({ quality, effort: 5 }).toBuffer();
    while (output.length > MAX_BYTES && quality > MIN_QUALITY) {
      quality -= 5;
      output = await sharp(cropped).resize({ width: w }).webp({ quality, effort: 5 }).toBuffer();
    }
    if (output.length > MAX_BYTES) {
      console.log(`${id}-${w}.webp  skipped (over 200 KB at quality ${MIN_QUALITY})`);
      continue;
    }
    await writeFile(new URL(`${id}-${w}.webp`, outDir), output);
    console.log(`${id}-${w}.webp  ${Math.round(output.length / 1024)} KB (quality ${quality})`);
  }
}

// Remove copies of photos that are no longer listed in content/photos/.
for (const name of await readdir(outDir)) {
  const match = name.match(/^(.+)-\d+\.webp$/);
  if (match && !ids.includes(match[1])) {
    await rm(new URL(name, outDir));
    console.log(`${name}: removed (no longer listed in content/photos/)`);
  }
}

// List which widths exist for each photo, so pages only ever ask for files that are there.
const sizes = {};
for (const name of (await readdir(outDir)).sort()) {
  const match = name.match(/^(.+)-(\d+)\.webp$/);
  if (match) (sizes[match[1]] ??= []).push(Number(match[2]));
}
for (const widths of Object.values(sizes)) widths.sort((a, b) => a - b);
await writeFile(new URL('sizes.json', outDir), JSON.stringify(sizes, null, 2) + '\n');
