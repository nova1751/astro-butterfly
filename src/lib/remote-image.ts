/**
 * Build-time check of a remote image: returns its final URL (percent-encoded,
 * redirects followed) or undefined when it can't be fetched as an image.
 *
 * Redirects are followed by hand because unpkg answers unversioned paths with
 * a `Location` header carrying raw UTF-8 (e.g. Chinese file names); fetch reads
 * header bytes as latin1, so the automatic redirect lands on a broken URL.
 */
const cache = new Map<string, Promise<string | undefined>>();

export const IMAGE_HOSTS = ['s2.loli.net', 'i.loli.net', 'npm.elemecdn.com', 'unpkg.com'];

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
    p = follow(url)
      .catch(() => undefined)
      .then((final) => {
        if (!final) console.warn(`[images] ${url} unreachable at build time; keeping the original URL`);
        return final;
      });
    cache.set(url, p);
  }
  return p;
}
