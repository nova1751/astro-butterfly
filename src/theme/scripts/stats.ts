/**
 * Busuanzi (不蒜子) counters, like Butterfly's `busuanzi` option:
 * site UV / PV in the aside's webinfo card and the page PV in the post meta.
 *
 * Elements: <span data-bsz="site_uv|site_pv|page_pv">…</span>.
 * One JSONP request per page view (it is the counter: calling it records the view),
 * re-run on client-side navigation just as Butterfly re-ran it after pjax.
 *
 * Slow or blocked network: the request is async and never blocks rendering; the
 * placeholder "…" turns into "—" after TIMEOUT, and a late answer still fills in.
 * The script sends the full page URL as Referer (busuanzi keys page_pv by it); with
 * the browser default policy only the origin is sent and every post would show the
 * homepage's count.
 */

type Counts = { site_uv: number; site_pv: number; page_pv: number };

const API = 'https://busuanzi.ibruce.info/busuanzi';
const TIMEOUT = 8000;
let seq = 0;

function fill(data: Partial<Counts> | null) {
  document.querySelectorAll<HTMLElement>('[data-bsz]').forEach((el) => {
    const v = data?.[el.dataset.bsz as keyof Counts];
    if (typeof v === 'number') {
      el.textContent = v.toLocaleString('zh-CN');
      el.removeAttribute('aria-busy');
      el.removeAttribute('title');
    } else if (!data && el.getAttribute('aria-busy') === 'true') {
      el.textContent = '—';
      el.removeAttribute('aria-busy');
      el.title = '统计服务暂时无法访问';
    }
  });
}

function count() {
  const cb = `BusuanziCallback_${Date.now().toString(36)}_${seq++}`;
  const w = window as unknown as Record<string, unknown>;
  const s = document.createElement('script');
  const timer = window.setTimeout(() => fill(null), TIMEOUT);
  const cleanup = () => {
    s.remove();
    delete w[cb];
  };
  w[cb] = (data: Counts) => {
    clearTimeout(timer);
    cleanup();
    fill(data);
  };
  s.src = `${API}?jsonpCallback=${cb}`;
  s.async = true;
  s.referrerPolicy = 'no-referrer-when-downgrade';
  s.onerror = () => {
    clearTimeout(timer);
    cleanup();
    fill(null);
  };
  document.head.append(s);
}

export function initStats() {
  if (!document.body.hasAttribute('data-busuanzi')) return;
  count();
}
