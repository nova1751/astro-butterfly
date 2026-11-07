const root = document.documentElement;
const NAV_FIXED_AT = 56;
let lastY = 0;
let ticking = false;

function update() {
  ticking = false;
  const y = window.scrollY;
  const down = y > lastY;
  lastY = y;

  // Butterfly nav: becomes fixed after 56px, hides while scrolling down, shows while scrolling up
  const fixed = y > NAV_FIXED_AT;
  root.classList.toggle('nav-fixed', fixed);
  root.classList.toggle('nav-visible', fixed && !down);
  root.classList.toggle('show-rightside', y > NAV_FIXED_AT);
  if (!fixed) root.classList.remove('nav-visible');

  const percentEl = document.querySelector<HTMLElement>('[data-scroll-percent]');
  if (percentEl) {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? Math.round((y / max) * 100) : 0;
    percentEl.textContent = pct > 0 && pct < 100 ? String(pct) : '';
  }
}

export function onPageScroll() {
  lastY = window.scrollY;
  update();
}

export function initScroll() {
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );

  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-go-up]')) {
      window.scrollTo({ top: 0 });
      document.getElementById('main-content')?.focus({ preventScroll: true });
    }
  });
}
