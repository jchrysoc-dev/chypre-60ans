/**
 * Looks up the photos listed in content/photos/*.yaml and the image files made for them
 * by scripts/fetch-photos.mjs (npm run photos), listed in public/photos/sizes.json.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import sizes from '../../public/photos/sizes.json';

export type PhotoEntry = CollectionEntry<'photos'>;

export interface PhotoImage {
  /** The id, which is also the file name stem in public/photos/. */
  id: string;
  alt: string;
  caption: string;
  /** Who took it. Left out for some of the family's own photos. */
  creditName?: string;
  creditUrl?: string;
  /** CSS aspect-ratio, e.g. "3 / 2". */
  aspect: string;
  /** CSS object-position. */
  focus: string;
  src: string;
  srcset: string;
  /** Pixel size of the file used for src, to stop the page jumping while the photo loads. */
  width: number;
  height: number;
}

/** The photo that decorates a page (matched on the `page` field), if there is one. */
export async function photoForPage(pathname: string): Promise<PhotoImage | undefined> {
  const page = pathname.replace(/\/$/, '') || '/';
  const entry = (await getCollection('photos'))
    .sort((a, b) => a.id.localeCompare(b.id))
    .find((photo) => photo.data.page === page);
  return entry && toImage(entry);
}

export function toImage(entry: PhotoEntry): PhotoImage {
  const { id, data } = entry;
  const widths = (sizes as Record<string, number[]>)[id];
  if (!widths?.length) {
    throw new Error(`content/photos/${id}.yaml has no image files yet. Run: npm run photos`);
  }
  const [w, h] = data.aspect.split(':').map(Number);
  const file = (width: number) => `/photos/${id}-${width}.webp`;
  const src = widths.includes(800) ? 800 : widths[widths.length - 1];
  return {
    id,
    alt: data.alt,
    caption: data.caption,
    creditName: data.credit_name,
    creditUrl: data.credit_url,
    aspect: `${w} / ${h}`,
    focus: data.focus,
    src: file(src),
    srcset: widths.map((width) => `${file(width)} ${width}w`).join(', '),
    width: src,
    height: Math.round((src * h) / w),
  };
}
