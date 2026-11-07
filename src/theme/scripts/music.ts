/**
 * APlayer + Meting API without the meting.js runtime.
 * - Global fixed player: created once, lives in a `transition:persist` container.
 * - `::music{}` embeds on the music page: created per page, destroyed on navigation.
 */
type APlayerInstance = {
  destroy: () => void;
  pause: () => void;
  on: (ev: string, cb: () => void) => void;
};
type APlayerCtor = new (o: object) => APlayerInstance;
type Track = { name?: string; title?: string; artist?: string; author?: string; url: string; pic?: string; cover?: string; lrc?: string };

/** Embed playlist height on desktop (300px on phones, MusicPlayer.astro);
 * `.music-embed` reserves the matching space while loading (content.css). */
const EMBED_LIST_HEIGHT = 720;

let APlayer: APlayerCtor | undefined;
let globalPlayer: APlayerInstance | undefined;
let pagePlayers: APlayerInstance[] = [];

async function loadAPlayer() {
  if (!APlayer) {
    const [mod] = await Promise.all([import('aplayer'), import('aplayer/dist/APlayer.min.css')]);
    APlayer = (mod.default ?? mod) as unknown as APlayerCtor;
  }
  return APlayer;
}

async function fetchList(api: string, server: string, type: string, id: string) {
  const url = api.replace(':server', server).replace(':type', type).replace(':id', id).replace(':r', String(Math.random()));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Meting ${res.status}`);
  const list = (await res.json()) as Track[];
  return list.map((t) => ({
    name: t.name ?? t.title,
    artist: t.artist ?? t.author,
    url: t.url,
    cover: t.pic ?? t.cover,
    lrc: t.lrc,
  }));
}

/** Only one player makes sound at a time (APlayer mutex across instances). */
function exclusive(p: APlayerInstance) {
  p.on('play', () => [globalPlayer, ...pagePlayers].forEach((o) => o && o !== p && o.pause()));
}

async function initGlobal() {
  const el = document.querySelector<HTMLElement>('[data-global-music]');
  if (!el || globalPlayer || el.dataset.state) return;
  el.dataset.state = 'loading';
  try {
    const [Ctor, audio] = await Promise.all([
      loadAPlayer(),
      fetchList(el.dataset.api!, el.dataset.server!, el.dataset.type!, el.dataset.id!),
    ]);
    // APlayer builds the player full width and then collapses it; without this
    // the collapse plays as a 0.3s animation on every first load.
    el.classList.add('ap-init');
    globalPlayer = new Ctor({
      container: el,
      fixed: true,
      autoplay: false,
      order: 'random',
      preload: 'none',
      volume: 0.55,
      theme: 'var(--theme-color)',
      lrcType: 3,
      audio,
    });
    // Keep a single lyric line visible while allowing its surface to be translucent.
    // APlayer retains its reference to the contents and its native 16px transforms.
    const contents = el.querySelector<HTMLElement>('.aplayer-lrc-contents')!;
    const viewport = document.createElement('div');
    viewport.className = 'aplayer-lrc-viewport';
    contents.before(viewport);
    viewport.append(contents);
    // Match the original blog: lyrics start hidden, and the LRC button toggles them.
    // Use the button so APlayer's visibility and button state stay in sync.
    el.querySelector<HTMLButtonElement>('.aplayer-icon-lrc')!.click();
    exclusive(globalPlayer);
    el.dataset.state = 'ready';
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('ap-init')));
  } catch {
    el.dataset.state = '';
  }
}

async function initEmbeds() {
  pagePlayers.forEach((p) => p.destroy());
  pagePlayers = [];
  const embeds = [...document.querySelectorAll<HTMLElement>('[data-meting]')];
  if (!embeds.length) return;
  const Ctor = await loadAPlayer();
  await Promise.all(
    embeds.map(async (el) => {
      try {
        // each embed carries the API itself, so it works without the floating player
        const audio = await fetchList(el.dataset.api!, el.dataset.server!, el.dataset.type!, el.dataset.id!);
        el.textContent = '';
        delete el.dataset.failed;
        const p = new Ctor({ container: el, theme: 'var(--theme-color)', preload: 'none', listMaxHeight: `${EMBED_LIST_HEIGHT}px`, lrcType: 3, audio });
        exclusive(p);
        pagePlayers.push(p);
      } catch {
        el.dataset.failed = '';
        el.innerHTML = '歌单加载失败，<button type="button" class="hl-label">重试</button>';
        el.querySelector('button')?.addEventListener('click', () => initEmbeds(), { once: true });
      }
    }),
  );
}

let started = false;

export function initMusic() {
  if (!started) {
    started = true;
    // load the floating player once the page is idle (it never autoplays)
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    idle(() => initGlobal(), { timeout: 4000 });
    document.addEventListener('astro:before-swap', () => {
      pagePlayers.forEach((p) => p.destroy());
      pagePlayers = [];
    });
  }
  initEmbeds();
}
