import { getImage } from 'astro:assets';
import { isOptimizableRemote, resolveRemoteImage } from './remote-image';

/**
 * Remote images (image hosts, CDNs) re-encoded at build time: AVIF, sized for
 * where they are shown, served from this site. Visitors no longer download
 * multi-hundred-KB PNGs from third-party hosts.
 *
 * If a source can't be fetched while building, the original URL is used, so a
 * flaky image host never fails the build. Astro caches the downloaded originals
 * and the encoded results in node_modules/.astro (cached in CI as well).
 */
export type Img = { src: string; srcset?: string; sizes?: string };

type Options = {
  /** Fixed output box: both set -> cropped to cover it (thumbnails, avatars). */
  width: number;
  height?: number;
  /** Responsive candidates; the shown size is picked by `sizes`. */
  widths?: number[];
  sizes?: string;
};

const done = new Map<string, Promise<Img>>();

export function optimize(src: string, o: Options): Promise<Img> {
  const key = JSON.stringify([src, o]);
  let p = done.get(key);
  if (!p) {
    p = (async () => {
      const remote = isOptimizableRemote(src) ? await resolveRemoteImage(src) : undefined;
      if (!remote) return { src };
      const img = await getImage({
        src: remote,
        format: 'avif',
        width: o.width,
        ...(o.height ? { height: o.height, fit: 'cover' } : { inferSize: true }),
        ...(o.widths ? { widths: o.widths, sizes: o.sizes } : { densities: [1, 2] }),
      });
      return { src: img.src, srcset: img.srcSet.attribute || undefined, sizes: o.sizes };
    })().catch((e) => {
      console.warn(`[images] ${src}: ${e}; using the original URL`);
      return { src };
    });
    done.set(key, p);
  }
  return p;
}

/** Presets for each place an image is shown (sizes measured at 1440 / 1024 / 393px). */
export const imagePresets = {
  /** Home card cover: ~363x250 desktop, full card width on phones */
  card: { width: 800, widths: [400, 600, 800], sizes: '(max-width: 768px) 100vw, 420px' },
  /** Page / post header: full viewport width, 400px (340px on phones) high */
  header: { width: 1920, widths: [768, 1280, 1920], sizes: '100vw' },
  /** Prev / next and related post covers: ~392x150 */
  pager: { width: 800, widths: [400, 800], sizes: '(max-width: 768px) 100vw, 400px' },
  /** Square thumbnails in the aside / archives (64-80px) */
  thumb: { width: 80, height: 80 },
  avatar: { width: 120, height: 120 },
  logo: { width: 36, height: 36 },
} satisfies Record<string, Options>;
