/**
 * Build-time check of a remote image: returns its final URL (percent-encoded,
 * redirects followed) or undefined when it can't be fetched as an image.
 *
 * Redirects are followed by hand because unpkg answers unversioned paths with
 * a `Location` header carrying raw UTF-8 (e.g. Chinese file names); fetch reads
 * header bytes as latin1, so the automatic redirect lands on a broken URL.
 */
const cache = new Map<string, Promise<string | undefined>>();

/**
 * npm CDNs serve the same package files under `/<package>/<path>` (jsDelivr
 * under `/npm/...`). When one isn't reachable from the build machine (the
 * mainland mirror often isn't from CI), the image is fetched from another:
 * the optimized copy is served from this site, so visitors never notice.
 */
const NPM_MIRRORS: Record<string, string> = {
  'npm.elemecdn.com': 'https://npm.elemecdn.com/',
  'unpkg.com': 'https://unpkg.com/',
  'cdn.jsdelivr.net': 'https://cdn.jsdelivr.net/npm/',
};

export const IMAGE_HOSTS = ['s2.loli.net', 'i.loli.net', ...Object.keys(NPM_MIRRORS)];

/** The URL itself, then the same npm file on the other mirrors. */
export function mirrorsOf(url: string): string[] {
  const u = new URL(url);
  const base = NPM_MIRRORS[u.hostname];
  if (!base) return [url];
  const path = u.href.slice(base.length);
  if (!u.href.startsWith(base) || !path) return [url];
  return [url, ...Object.values(NPM_MIRRORS).filter((b) => b !== base).map((b) => b + path)];
}

export function isOptimizableRemote(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && IMAGE_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

async function follow(url: string): Promise<string | undefined> {
  let current = new URL(url).href;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    await res.body?.cancel();
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(Buffer.from(location, 'latin1').toString('utf8'), current).href;
      continue;
    }
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/') ? current : undefined;
  }
  return undefined;
}

export function resolveRemoteImage(url: string): Promise<string | undefined> {
  // The build runner's second attempt emits original URLs and skips all remote probes.
  if (process.env.BLOG_DISABLE_IMAGE_OPTIMIZATION === '1') return Promise.resolve(undefined);
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      for (const candidate of mirrorsOf(url)) {
        const final = await follow(candidate).catch(() => undefined);
        if (final) return final;
      }
      return undefined;
    })().then((final) => {
        if (!final) console.warn(`[images] ${url} unreachable at build time; keeping the original URL`);
        return final;
      });
    cache.set(url, p);
  }
  return p;
}
