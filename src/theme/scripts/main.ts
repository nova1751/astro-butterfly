/**
 * Client entry. Module scripts run once per full page load; everything that
 * depends on the current page re-runs on `astro:page-load` (fires on first load
 * and after every View Transition navigation).
 *
 * Non-critical / page-specific features (search, translate, power-mode, TOC,
 * article content tools, Mermaid, music runtime) are dynamically imported only
 * when the current page or visitor interaction actually needs them.
 */
import { initPersistStyles } from './persist-styles';
import { initPreferences } from './preferences';
import { initScroll, onPageScroll } from './scroll';
import { initSidebar } from './sidebar';
import { initNavMenu } from './nav-menu';
import { initMusic } from './music';
import { initComments } from './comments';
import { initClock } from './clock';
import { initLoadBar } from './load-bar';
import { initStats } from './stats';
import { initBodyFont } from './fallback-font';
import { load } from './store';

initPersistStyles(); // must run before any library injects CSS
initLoadBar(); // first, so a slow first load shows progress as early as possible
initBodyFont();
initPreferences();
initScroll();
initSidebar();
initNavMenu();

// Search dialog: load Pagefind UI only on click or keyboard shortcut.
document.addEventListener('click', (e) => {
  if (!(e.target as Element).closest('[data-search-open]')) return;
  e.preventDefault();
  void import('./search').then((m) => m.openSearch());
});
document.addEventListener('keydown', (e) => {
  if (
    (e.key === 'k' && (e.metaKey || e.ctrlKey)) ||
    (e.key === '/' && !/INPUT|TEXTAREA/.test((e.target as Element).tagName) && !(e.target as HTMLElement).isContentEditable)
  ) {
    e.preventDefault();
    void import('./search').then((m) => m.openSearch());
  }
});

// Simplified ⇄ Traditional: load immediately only if Traditional is already selected,
// otherwise wait for a click on the toggle button.
if (load('zh-script') === 'hant') {
  void import('./translate').then((m) => m.initTranslate());
}
document.addEventListener('click', (e) => {
  const btn = (e.target as Element).closest('[data-translate]');
  if (btn) void import('./translate').then((m) => m.toggleTranslate(btn));
});

// Tabs: delegated synchronously so clicks and arrow keys work before content.ts finishes loading.
function selectTab(list: Element, index: number, focus = false) {
  const buttons = [...list.querySelectorAll<HTMLButtonElement>(':scope > [role=tab]')];
  if (!buttons.length) return;
  const target = ((index % buttons.length) + buttons.length) % buttons.length;
  buttons.forEach((b, j) => {
    const on = target === j;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(b.getAttribute('aria-controls')!);
    if (panel) panel.hidden = !on;
  });
  if (focus) buttons[target].focus();
}
document.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>('[data-tabs] > .tab-list > [role=tab]');
  if (!b) return;
  const list = b.parentElement!;
  const buttons = [...list.querySelectorAll<HTMLButtonElement>(':scope > [role=tab]')];
  selectTab(list, buttons.indexOf(b));
});
document.addEventListener('keydown', (e) => {
  const b = (e.target as Element).closest?.<HTMLButtonElement>('[data-tabs] > .tab-list > [role=tab]');
  if (!b) return;
  const list = b.parentElement!;
  const buttons = [...list.querySelectorAll<HTMLButtonElement>(':scope > [role=tab]')];
  const i = buttons.indexOf(b);
  if (i < 0) return;
  const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: buttons.length - 1 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  selectTab(list, next, true);
});

// Lightbox: works for both article images and comment images on any page.
document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-pswp]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  void loadContent()
    .then((m) => m.openLightbox(a))
    .catch(() => window.open(a.href, '_blank'));
});

// Typing sparks: desktop-only, loaded on first focus/input in an editable field.
{
  const raw = document.body.dataset.powerMode;
  if (raw) {
    const opts = JSON.parse(raw) as { mobile?: boolean };
    if (opts.mobile || matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const FIELD = 'textarea, input:not([type]), input[type=text], input[type=search], input[type=email], input[type=url], [contenteditable=""], [contenteditable=true]';
      let loading: Promise<void> | undefined;
      let pendingTarget: Element | undefined;
      const loadPowerMode = () => {
        loading ??= import('./power-mode').then((m) => {
          document.removeEventListener('focusin', onFocus);
          document.removeEventListener('input', onInput);
          m.initPowerMode(pendingTarget);
          pendingTarget = undefined;
        });
      };
      const onFocus = (e: Event) => {
        const t = e.composedPath()[0];
        if (t instanceof Element && t.matches(FIELD)) loadPowerMode();
      };
      const onInput = (e: Event) => {
        const t = e.composedPath()[0];
        if (!(t instanceof Element) || !t.matches(FIELD)) return;
        pendingTarget = t;
        loadPowerMode();
      };
      document.addEventListener('focusin', onFocus);
      document.addEventListener('input', onInput);
    }
  }
}

let tocMod: Promise<typeof import('./toc')> | undefined;
const loadToc = () => (tocMod ??= import('./toc'));
if (document.querySelector('[data-toc]')) void loadToc();

let contentMod: Promise<typeof import('./content')> | undefined;
const loadContent = () => (contentMod ??= import('./content'));
if (document.querySelector('#article-container')) {
  void loadContent().then((m) => m.initContent());
}

let tocCleanup: (() => void) | undefined;
async function initPageToc() {
  const toc = document.querySelector<HTMLElement>('[data-toc]');
  const mobileBtn = document.querySelector<HTMLElement>('[data-mobile-toc]');
  const commentBtn = document.querySelector<HTMLElement>('[data-comment-btn]');
  if (commentBtn) commentBtn.hidden = !document.getElementById('post-comment');
  if (mobileBtn) mobileBtn.hidden = !toc;
  if (!toc) {
    tocCleanup?.();
    tocCleanup = undefined;
    return;
  }
  const m = await loadToc();
  tocCleanup = m.cleanupToc;
  m.initToc();
}

async function initPageContent() {
  if (document.querySelector('#article-container')) {
    (await loadContent()).initContent();
  }
}

function initPageMermaid() {
  if (document.querySelector('.mermaid-diagram')) {
    void import('./mermaid').then((m) => m.initMermaid());
  }
}

// One task per feature, so a long page never blocks input for all of them at once.
// A navigation during the gaps cancels the rest: its own page-load runs them all again.
const pageInits = [onPageScroll, initPageToc, initPageContent, initPageMermaid, initMusic, initClock, initComments, initStats];
let pageLoads = 0;
document.addEventListener('astro:page-load', async () => {
  const current = ++pageLoads;
  for (const init of pageInits) {
    await init();
    await new Promise((resolve) => setTimeout(resolve));
    if (current !== pageLoads) return;
  }
});
