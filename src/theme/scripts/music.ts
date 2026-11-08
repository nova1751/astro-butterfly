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
    // Build the full playlist only when the visitor opens the player.
    document.addEventListener('click', (e) => {
      if ((e.target as Element).closest('[data-music-start]')) void initGlobal();
    });
    document.addEventListener('astro:before-swap', () => {
      pagePlayers.forEach((p) => p.destroy());
      pagePlayers = [];
    });
  }
  initEmbeds();
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
