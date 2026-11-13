/**
 * Busuanzi (不蒜子) counters, using the same endpoint as the official 2.3 script:
 * site UV / PV in the aside's webinfo card and the page PV in the post meta.
 *
 * Elements: <span data-bsz="site_uv|site_pv|page_pv">…</span>.
 * One JSONP request per page view (it is the counter: calling it records the view),
 * re-run when Astro swaps in a new page.
 *
 * Slow or blocked network: the request is async and never blocks rendering; the
 * placeholder "…" turns into "—" after TIMEOUT. A late answer can still fill in
 * while that page is open.
 * The script sends the full page URL as Referer (busuanzi keys page_pv by it); with
 * the browser default policy only the origin is sent and every post would show the
 * homepage's count.
 */

type Counts = Partial<Record<'site_uv' | 'site_pv' | 'page_pv', unknown>>;

const API = 'https://busuanzi.ibruce.info/busuanzi';
const TIMEOUT = 8000;
const countedPages = new WeakSet<HTMLElement>();
let requestId = 0;
let cancelPending: (() => void) | undefined;

document.addEventListener('astro:before-swap', () => cancelPending?.());

function fill(body: HTMLElement, data: Counts | null) {
  body.querySelectorAll<HTMLElement>('[data-bsz]').forEach((el) => {
    const v = data?.[el.dataset.bsz as keyof Counts];
    if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) {
      el.textContent = v.toLocaleString('zh-CN');
      el.removeAttribute('aria-busy');
      el.removeAttribute('title');
    } else if (el.getAttribute('aria-busy') === 'true') {
      el.textContent = '—';
      el.removeAttribute('aria-busy');
      el.title = '统计服务暂时无法访问';
    }
  });
}

export function initStats() {
  const { body } = document;
  if (!body.hasAttribute('data-busuanzi') || countedPages.has(body)) return;
  countedPages.add(body);

  const callbackName = `BusuanziCallback_${Date.now().toString(36)}_${++requestId}`;
  const callbacks = window as unknown as Record<string, (data: Counts | null) => void>;
  const script = document.createElement('script');
  const timer = window.setTimeout(() => fill(body, null), TIMEOUT);
  const cleanup = () => {
    window.clearTimeout(timer);
    script.onload = script.onerror = null;
    script.remove();
    delete callbacks[callbackName];
    cancelPending = undefined;
  };
  const finish = (data: Counts | null) => {
    cleanup();
    fill(body, data);
  };

  cancelPending = cleanup;
  callbacks[callbackName] = finish;
  // A response can load successfully without invoking the JSONP callback.
  script.onload = script.onerror = () => finish(null);
  script.src = `${API}?jsonpCallback=${callbackName}`;
  script.async = true;
  script.referrerPolicy = 'no-referrer-when-downgrade';
  document.head.append(script);
}
