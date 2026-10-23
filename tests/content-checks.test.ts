import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkContent, parseMarkdown, type ContentFile } from '../scripts/content-checks.ts';
import { accommodationSchema, activitySchema, cyprusResourceSchema, photoSchema } from '../src/lib/content-schemas.ts';
import { parse as parseYaml } from 'yaml';

const activityText = (extra = '', start = '"2027-05-30T18:00+03:00"') =>
  `---\ntitle: Sunset cruise\nsummary: A cruise.\nstart: ${start}\nmeeting_point: Marina\ncost_eur: 35\n${extra}---\n\nBring a hat.\n`;
const file = (path: string, text: string): ContentFile => ({ path, text });
const check = (files: ContentFile[], sizes = {}, images: string[] = []) => checkContent(files, sizes, new Set(images));
const messages = (files: ContentFile[]) => check(files).problems.map((p) => p.message);

describe('content checks', () => {
  it('accepts a good activity', () => {
    expect(check([file('content/activities/sunset-cruise.md', activityText())]).problems).toEqual([]);
  });

  it('names the field someone probably meant when it is misspelt', () => {
    const [message] = messages([file('content/activities/sunset-cruise.md', activityText('capacty: 20\n'))]);
    expect(message).toContain('"capacty" is not a field this file knows');
    expect(message).toContain('Did you mean "capacity"?');
  });

  it('asks for quotes around an unquoted time', () => {
    const [message] = messages([file('content/activities/sunset-cruise.md', activityText('', '2027-05-30T18:00:00+03:00'))]);
    expect(message).toContain('in quotes');
  });

  it('copes with Windows line endings', () => {
    const windows = activityText().replace(/\n/g, '\r\n');
    expect(check([file('content/activities/sunset-cruise.md', windows)]).problems).toEqual([]);
  });

  it('rejects a link that is not https', () => {
    const text = `---\ntitle: T\nsummary: S\norder: 10\nlinks:\n  - label: L\n    url: http://example.com\n---\nBody\n`;
    expect(messages([file('content/cyprus/links.md', text)])[0]).toContain('https://');
  });

  it('rejects an activity in the wrong year', () => {
    const [message] = messages([file('content/activities/sunset-cruise.md', activityText('', '"2026-05-30T18:00+03:00"'))]);
    expect(message).toContain('2027');
  });

  it('rejects file names with capitals or spaces', () => {
    const [message] = messages([file('content/activities/Sunset Cruise.md', activityText())]);
    expect(message).toContain('lowercase words joined by dashes');
  });

  it('rejects a file in a folder the website does not read', () => {
    const [message] = messages([file('content/notes/ideas.md', '---\ntitle: x\n---\n')]);
    expect(message).toContain('does not read this file');
  });

  it('ignores template files', () => {
    expect(check([file('content/activities/_template.md', 'not even valid')]).problems).toEqual([]);
  });

  describe('personal details', () => {
    it.each([
      ['an email address', 'Ask anna@example.com for a lift.'],
      ['a phone number', 'Call +357 22 123456 to book.'],
      ['a phone number', 'Call 99123456 to book.'],
    ])('flags %s', (kind, line) => {
      const [message] = messages([file('content/activities/sunset-cruise.md', activityText() + line + '\n')]);
      expect(message).toContain(kind);
    });

    it('does not mistake times, dates, prices or photo codes for phone numbers', () => {
      const text = activityText() + 'Meet 2027-05-30T18:00+03:00, 35 euros, emergency 112, https://x.org/a/1234567890123\n';
      expect(check([file('content/activities/sunset-cruise.md', text)]).problems).toEqual([]);
    });
  });

  describe('photos', () => {
    const photo = (page = 'page: /activities\n', id = 'photo-1701121685501-03d44cca164c') =>
      `unsplash_id: ${id}\nalt: Sea.\ncaption: The sea\ncredit_name: A. Person on Unsplash\ncredit_url: https://unsplash.com/photos/x\naspect: 3:2\n${page}`;

    it('needs the web-sized copies', () => {
      const [message] = messages([file('content/photos/sea.yaml', photo())]);
      expect(message).toContain('npm run photos');
    });

    it('accepts a photo whose copies exist', () => {
      const result = check([file('content/photos/sea.yaml', photo())], { sea: [480] }, ['sea-480.webp']);
      expect(result.problems).toEqual([]);
    });

    it('allows only one photo per page', () => {
      const result = check(
        [file('content/photos/sea.yaml', photo()), file('content/photos/sky.yaml', photo())],
        { sea: [480], sky: [480] },
        ['sea-480.webp', 'sky-480.webp'],
      );
      expect(result.problems.map((p) => p.message)).toEqual([expect.stringContaining('Only one can be shown')]);
    });

    it('wants either an Unsplash code or one of her own files, not both', () => {
      const both = photo() + 'source_file: harbour.jpg\n';
      expect(photoSchema.safeParse(parseYaml(both)).success).toBe(false);
    });

    it('does not ask for a credit on her own photo', () => {
      const own = 'source_file: harbour.jpg\nalt: Boats.\ncaption: The harbour\naspect: 3:2\n';
      expect(photoSchema.safeParse(parseYaml(own)).success).toBe(true);
    });

    it('requires a credit for an Unsplash photo', () => {
      const bare = 'unsplash_id: photo-1701121685501-03d44cca164c\nalt: Sea.\ncaption: The sea\naspect: 3:2\n';
      expect(photoSchema.safeParse(parseYaml(bare)).success).toBe(false);
    });
  });
});

describe('templates', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf-8');

  it.each([
    ['content/activities/_template.md', activitySchema],
    ['content/accommodation/_template.md', accommodationSchema],
    ['content/cyprus/_template.md', cyprusResourceSchema],
  ])('%s is valid, so it can never go stale', (path, schema) => {
    const result = schema.safeParse(parseMarkdown(read(path)).data);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('content/photos/_template.yaml is valid', () => {
    const result = photoSchema.safeParse(parseYaml(read('content/photos/_template.yaml'), { customTags: ['timestamp'] }));
    expect(result.error?.issues ?? []).toEqual([]);
  });
});
