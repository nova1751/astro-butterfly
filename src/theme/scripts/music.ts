import aplayerCss from 'aplayer/dist/APlayer.min.css?url';
import { loadStyle } from './load-style';

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
/** Rows an embed playlist shows on desktop before it scrolls: 32px each plus a 1px divider. */
const EMBED_LIST_ROWS = 24;
const EMBED_LIST_HEIGHT = EMBED_LIST_ROWS * 33 - 1;

let APlayer: APlayerCtor | undefined;
let globalPlayer: APlayerInstance | undefined;
let pagePlayers: APlayerInstance[] = [];

async function loadAPlayer() {
  if (!APlayer) {
    const [mod] = await Promise.all([import('aplayer'), loadStyle(aplayerCss)]);
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

let globalList: Promise<Awaited<ReturnType<typeof fetchList>>> | undefined;

/** The global playlist, fetched once per visit (a failed fetch is retried on the next call). */
function getGlobalList(el: HTMLElement) {
  globalList ??= fetchList(el.dataset.api!, el.dataset.server!, el.dataset.type!, el.dataset.id!).catch((e) => {
    globalList = undefined;
    throw e;
  });
  return globalList;
}

/**
 * Idle until urgent: once the page has loaded and the browser is idle, fetch
 * what opening the player needs (APlayer's code and styles, the playlist from
 * the Meting API, which alone takes ~1 s), so a click only builds the player.
 * Skipped when the visitor asks to save data or is on a 2G connection.
 */
function warmUp() {
  const el = document.querySelector<HTMLElement>('[data-global-music]');
  if (!el || globalPlayer || el.dataset.state) return;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || /2g/.test(conn?.effectiveType ?? '')) return;
  loadAPlayer().catch(() => {});
  getGlobalList(el).catch(() => {});
}

function warmUpWhenIdle() {
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(warmUp, { timeout: 5000 }) : setTimeout(warmUp, 2000));
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });
}

/** Only one player makes sound at a time (APlayer mutex across instances). */
function exclusive(p: APlayerInstance) {
  p.on('play', () => [globalPlayer, ...pagePlayers].forEach((o) => o && o !== p && o.pause()));
}

async function initGlobal() {
  const el = document.querySelector<HTMLElement>('[data-global-music]');
  if (!el || globalPlayer || el.dataset.state) return;
  el.dataset.state = 'loading';
  const trigger = el.querySelector<HTMLButtonElement>('[data-music-start]');
  if (trigger) trigger.disabled = true;
  try {
    const [Ctor, audio] = await Promise.all([loadAPlayer(), getGlobalList(el)]);
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
    labelControls(el);
    trigger?.remove();
    el.querySelector<HTMLButtonElement>('.aplayer-miniswitcher')?.click();
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
    if (trigger) { trigger.disabled = false; trigger.setAttribute('aria-label', '音乐加载失败，点击重试'); }
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
        labelControls(el);
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
    // Build the player when the visitor opens it; its code and playlist are
    // fetched ahead of time, when the browser is idle or the pointer heads there.
    document.addEventListener('click', (e) => {
      if ((e.target as Element).closest('[data-music-start]')) void initGlobal();
    });
    document.addEventListener('pointerover', (e) => {
      if ((e.target as Element).closest?.('[data-music-start]')) warmUp();
    });
    // A tap or click elsewhere folds the playlist and the player away. `click`,
    // not `pointerdown`: a touch that turns into a scroll fires no click, so
    // scrolling the page while listening leaves the player open.
    document.addEventListener('click', (e) => {
      const target = e.target as Element | null;
      if (!target?.isConnected || target.closest('#global-music, [data-music-start]')) return;
      collapseGlobal(false);
    });
    // Escape folds the playlist first, then the player; left to dialogs and text fields.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return;
      if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable]')) return;
      collapseGlobal(true);
    });
    warmUpWhenIdle();
    document.addEventListener('astro:before-swap', () => {
      pagePlayers.forEach((p) => p.destroy());
      pagePlayers = [];
    });
  }
  initEmbeds();
}

/** Fold the global playlist and the player (`stepwise`: only the playlist if it is open). */
function collapseGlobal(stepwise: boolean) {
  const el = document.querySelector<HTMLElement>('#global-music.aplayer');
  if (!el) return;
  if (!el.querySelector('.aplayer-list')?.classList.contains('aplayer-list-hide')) {
    el.querySelector<HTMLElement>('.aplayer-icon-menu')?.click();
    if (stepwise) return;
  }
  if (!el.classList.contains('aplayer-narrow')) el.querySelector<HTMLElement>('.aplayer-miniswitcher')?.click();
}

/** APlayer's SVG-only controls need names for keyboard and screen-reader users. */
function labelControls(el: HTMLElement) {
  const labels: Record<string, string> = {
    play: '播放', pause: '暂停', back: '上一首', forward: '下一首',
    volume: '音量', order: '播放顺序', loop: '循环模式', menu: '歌单', lrc: '歌词',
  };
  for (const [icon, label] of Object.entries(labels)) {
    el.querySelectorAll(`.aplayer-icon-${icon}`).forEach((b) => b.setAttribute('aria-label', label));
  }
  const toggle = el.querySelector<HTMLElement>('.aplayer-miniswitcher');
  if (toggle) {
    toggle.setAttribute('role', 'button');
    toggle.tabIndex = 0;
    toggle.setAttribute('aria-label', '展开或收起音乐播放器');
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle.click(); }
    });
  }
}
