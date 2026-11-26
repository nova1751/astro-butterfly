/**
 * Lightweight entry for the music player. Defers the runtime (lyrics, Meting,
 * APlayer) until the visitor opens or hovers the player, visits a music embed
 * page, or the browser is idle after load.
 */
let runtime: Promise<typeof import('./music-runtime')> | undefined;
const loadRuntime = () => (runtime ??= import('./music-runtime'));

function warmUpWhenIdle() {
  const run = () => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || /2g/.test(conn?.effectiveType ?? '')) return;
    if (!document.querySelector('[data-global-music]')) return;
    void loadRuntime().then((m) => m.warmUp());
  };
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(run, { timeout: 5000 }) : setTimeout(run, 2000));
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}

let started = false;

export function initMusic() {
  if (!started) {
    started = true;
    document.addEventListener('click', (e) => {
      if ((e.target as Element).closest('[data-music-start]')) void loadRuntime().then((m) => m.initGlobal());
    });
    document.addEventListener('pointerover', (e) => {
      if ((e.target as Element).closest?.('[data-music-start]')) void loadRuntime().then((m) => m.warmUp());
    });
    warmUpWhenIdle();
  }
  if (document.querySelector('[data-meting]') || runtime) {
    void loadRuntime().then((m) => m.initEmbeds());
  }
}
