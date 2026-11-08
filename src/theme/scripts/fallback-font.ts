/**
 * The full LXGW font ('LXGW WenKai Screen Fallback', scripts/build-font.mjs)
 * covers text the site's own font chunks don't: comments, the weather city,
 * search input, traditional Chinese. None of it is part of the first paint, and
 * applying 97 extra @font-face rules re-matches fonts for the whole document —
 * a long style/layout task on big posts. So nothing loads it up front; each
 * feature that is about to show such text calls this first.
 *
 * The <link> is added once; persist-styles.ts carries it across navigations.
 */
let added = false;

export function useFallbackFont() {
  if (added) return;
  added = true;
  const href = document.documentElement.dataset.fallbackFont;
  if (!href || document.head.querySelector(`link[href="${CSS.escape(href)}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}
