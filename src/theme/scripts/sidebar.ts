/** Mobile navigation drawer. */
export function initSidebar() {
  const sidebar = () => document.getElementById('sidebar');
  let lastFocus: HTMLElement | null = null;

  const close = () => {
    const s = sidebar();
    if (!s || s.hidden) return;
    s.hidden = true;
    document.documentElement.style.overflow = '';
    lastFocus?.focus();
  };

  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-sidebar-open]')) {
      const s = sidebar();
      if (!s) return;
      lastFocus = document.activeElement as HTMLElement;
      s.hidden = false;
      document.documentElement.style.overflow = 'hidden';
      s.querySelector<HTMLElement>('a')?.focus();
    } else if (t.closest('[data-sidebar-close]') || t.closest('#sidebar a')) {
      close();
    }
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  document.addEventListener('astro:before-swap', close);
}
