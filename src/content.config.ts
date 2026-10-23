import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineCollection } from 'astro:content';
import { glob, type Loader } from 'astro/loaders';
import { parse as parseYaml } from 'yaml';
import {
  accommodationSchema,
  activitySchema,
  cyprusResourceSchema,
  eventSchema,
  pageSchema,
  photoSchema,
} from './lib/content-schemas';

/**
 * Loads content/event.yaml as a single entry with id "event".
 * Astro's built-in file() loader only logs YAML errors. This one fails the build.
 */
function eventYamlLoader(): Loader {
  const relativePath = 'content/event.yaml';
  return {
    name: 'event-yaml',
    load: async ({ store, parseData, config, watcher }) => {
      const path = fileURLToPath(new URL(relativePath, config.root));
      const sync = async () => {
        let raw: unknown;
        try {
          raw = parseYaml(await readFile(path, 'utf-8'));
        } catch (error) {
          throw new Error(`${relativePath} could not be read: ${(error as Error).message}`);
        }
        const data = await parseData({ id: 'event', data: raw as Record<string, unknown>, filePath: path });
        store.clear();
        store.set({ id: 'event', data, filePath: relativePath });
      };
      await sync();
      watcher?.add(path);
      watcher?.on('change', (changed) => changed === path && sync());
    },
  };
}

const markdown = (dir: string) => glob({ pattern: '*.md', base: `./content/${dir}` });

export const collections = {
  event: defineCollection({ loader: eventYamlLoader(), schema: eventSchema }),
  pages: defineCollection({ loader: glob({ pattern: '*.md', base: './content' }), schema: pageSchema }),
  activities: defineCollection({ loader: markdown('activities'), schema: activitySchema }),
  accommodation: defineCollection({ loader: markdown('accommodation'), schema: accommodationSchema }),
  cyprus: defineCollection({ loader: markdown('cyprus'), schema: cyprusResourceSchema }),
  photos: defineCollection({ loader: glob({ pattern: '*.yaml', base: './content/photos' }), schema: photoSchema }),
};
