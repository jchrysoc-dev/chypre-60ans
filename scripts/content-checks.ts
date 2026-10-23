/**
 * The checks behind `npm run check` / `npm run build`, kept free of file reading so tests can feed them
 * example files. scripts/check-content.ts reads the real files and prints the results.
 *
 * Every message is written for Mum: plain words, naming the file and the field.
 */
import { z } from 'astro/zod';
import { parse as parseYaml } from 'yaml';
import {
  accommodationSchema,
  activitySchema,
  cyprusResourceSchema,
  eventSchema,
  pageSchema,
  photoSchema,
} from '../src/lib/content-schemas.ts';

export interface ContentFile {
  /** Path from the project folder, with forward slashes, e.g. "content/activities/boat-trip.md". */
  path: string;
  text: string;
}

export interface Problem {
  file: string;
  message: string;
}

export interface CheckResult {
  problems: Problem[];
  /** Things still to fill in. Nothing is broken, so they never stop publishing. */
  todo: string[];
  /** How many content files were checked. */
  checked: number;
}

/** Add an address here only after Jacques agrees it belongs to a business, not a guest. */
export const ALLOWED_CONTACTS: string[] = [];

const FILE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FOLDERS = ['activities', 'accommodation', 'cyprus', 'photos'] as const;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// An international number (+357 22 123456), or eight or more digits in a row.
const PHONE = /(?:\+|\b00)\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}\b|\b\d{8,}\b/g;

/** Read the notes between the --- lines at the top of a Markdown file. */
export function parseMarkdown(text: string): { data: unknown; body: string } {
  const normal = text.replace(/\r\n/g, '\n');
  const match = normal.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n([\s\S]*))?$/);
  if (!match) throw new Error('The file must start with a line of three dashes (---), then the details, then another line of three dashes.');
  return { data: parseYaml(match[1], { customTags: ['timestamp'] }) ?? {}, body: match[2] ?? '' };
}

type Issue = { path: PropertyKey[]; message: string; code?: string; errors?: Issue[][] };

/** Turn a schema complaint into one plain sentence. */
function describe(issue: Issue): string[] {
  const where = issue.path.length ? issue.path.map(String).join(' > ') : '';
  if (issue.code === 'invalid_union' && issue.errors) {
    // e.g. a date that can also be TBD: explain the real rule, not the "must be TBD" branch.
    const reasons = issue.errors.flat().filter((nested) => !/TBD/.test(nested.message));
    const text = reasons.length ? reasons[0].message : `"${where}" is not a valid value. Use TBD if it is not decided yet.`;
    return [where && !text.includes(where) ? `${where}: ${text}` : text];
  }
  return [where && !issue.message.includes(`"${where.split(' > ').pop()}"`) ? `${where}: ${issue.message}` : issue.message];
}

function validate<T>(file: ContentFile, schema: z.ZodType<T>, data: unknown, problems: Problem[]) {
  const result = schema.safeParse(data);
  if (!result.success) {
    for (const issue of result.error.issues as unknown as Issue[]) {
      for (const message of describe(issue)) problems.push({ file: file.path, message });
    }
  }
  return result;
}

/**
 * @param files        every file under content/ (except the "originals" folder)
 * @param photoSizes   the contents of public/photos/sizes.json
 * @param imageFiles   the file names present in public/photos/
 */
export function checkContent(files: ContentFile[], photoSizes: Record<string, number[]>, imageFiles: Set<string>): CheckResult {
  const problems: Problem[] = [];
  const todo: string[] = [];
  let checked = 0;
  const photoPages = new Map<string, string[]>();
  let weekStart: string | undefined;
  let weekEnd: string | undefined;
  const activities: { path: string; start: string }[] = [];

  for (const file of files) {
    const parts = file.path.split('/'); // ["content", ...]
    const name = parts[parts.length - 1];
    if (name.startsWith('_')) continue; // templates
    const folder = parts.length === 3 ? parts[1] : undefined;
    const extension = name.slice(name.lastIndexOf('.'));
    checked++;

    // --- Is it somewhere the website reads, and named properly? ---
    const isEvent = file.path === 'content/event.yaml';
    const isPage = parts.length === 2 && extension === '.md';
    const isInFolder = folder !== undefined && (FOLDERS as readonly string[]).includes(folder) && extension === (folder === 'photos' ? '.yaml' : '.md');
    if (!isEvent && !isPage && !isInFolder) {
      problems.push({
        file: file.path,
        message: 'The website does not read this file. Content goes in content/activities, content/accommodation, content/cyprus or content/photos (and content/event.yaml for the party facts).',
      });
      continue;
    }
    if (!isEvent && !FILE_ID.test(name.slice(0, name.lastIndexOf('.')))) {
      problems.push({
        file: file.path,
        message: 'The file name must be lowercase words joined by dashes, like "sunset-cruise" (no capitals, spaces or accents).',
      });
    }

    // --- Personal details (the website's files are public) ---
    // Web addresses and Unsplash photo codes are full of digits that are not phone numbers.
    const withoutLinks = file.text.replace(/https?:\/\/\S+/g, ' ').replace(/photo-[\w-]+/g, ' ');
    for (const [pattern, kind, text] of [[EMAIL, 'an email address', file.text], [PHONE, 'a phone number', withoutLinks]] as const) {
      for (const found of text.match(pattern) ?? []) {
        if (ALLOWED_CONTACTS.includes(found.trim())) continue;
        problems.push({
          file: file.path,
          message: `This looks like ${kind} ("${found.trim()}"). Guests' personal details must not be in these files, because they are public on the internet. If it belongs to a business (a hotel, a taxi), ask Jacques to approve it.`,
        });
      }
    }

    // --- Things still to fill in ---
    const marks = file.text.match(/\[(?:Placeholder|Mum:)[^\]]*\]?/g);
    if (marks) todo.push(`${file.path}: ${marks.length} placeholder${marks.length > 1 ? 's' : ''} still to replace`);

    // --- The details at the top of the file ---
    let data: unknown;
    try {
      data = isEvent || extension === '.yaml' ? parseYaml(file.text, { customTags: ['timestamp'] }) : parseMarkdown(file.text).data;
    } catch (error) {
      problems.push({ file: file.path, message: `The file could not be read: ${(error as Error).message.split('\n')[0]}` });
      continue;
    }

    if (isEvent) {
      const result = validate(file, eventSchema, data, problems);
      if (result.success) {
        const event = result.data;
        if (event.week.start_date !== 'TBD') weekStart = event.week.start_date;
        if (event.week.end_date !== 'TBD') weekEnd = event.week.end_date;
        const unknown = [event.venue.name, event.venue.address, event.party.start, event.party.dress_code].filter((v) => v === 'TBD').length;
        if (unknown) todo.push(`content/event.yaml: ${unknown} party detail${unknown > 1 ? 's' : ''} still say TBD (to be decided)`);
      }
    } else if (isPage) {
      validate(file, pageSchema, data, problems);
    } else if (folder === 'activities') {
      const result = validate(file, activitySchema, data, problems);
      if (result.success) activities.push({ path: file.path, start: result.data.start });
    } else if (folder === 'accommodation') {
      validate(file, accommodationSchema, data, problems);
    } else if (folder === 'cyprus') {
      validate(file, cyprusResourceSchema, data, problems);
    } else if (folder === 'photos') {
      const result = validate(file, photoSchema, data, problems);
      const id = name.replace(/\.yaml$/, '');
      if (result.success) {
        const page = result.data.page;
        if (page) photoPages.set(page, [...(photoPages.get(page) ?? []), file.path]);
        const widths = photoSizes[id];
        if (!widths?.length) {
          problems.push({ file: file.path, message: 'There are no web-sized copies of this photo yet. Run: npm run photos' });
        } else {
          for (const width of widths) {
            if (!imageFiles.has(`${id}-${width}.webp`)) {
              problems.push({ file: file.path, message: `The copy public/photos/${id}-${width}.webp is missing. Run: npm run photos` });
            }
          }
        }
      }
    }
  }

  // --- Checks that look across files ---
  for (const [page, paths] of photoPages) {
    if (paths.length > 1) {
      problems.push({
        file: paths[1],
        message: `Two photos are set for the page "${page}" (${paths.join(' and ')}). Only one can be shown: change or remove "page" in one of them.`,
      });
    }
  }
  for (const { path, start } of activities) {
    const day = start.slice(0, 10);
    if (!day.startsWith('2027-')) {
      problems.push({ file: path, message: `"start" is in ${day.slice(0, 4)}, but the party is in 2027. Did you mean 2027?` });
    } else if (weekStart && weekEnd && (day < weekStart || day > weekEnd)) {
      problems.push({ file: path, message: `"start" (${day}) is outside the party week (${weekStart} to ${weekEnd}). Please check the date.` });
    }
  }

  return { problems, todo, checked };
}
