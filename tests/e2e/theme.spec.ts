import { test, expect, type Page } from '@playwright/test';

// Runs against `pnpm build` output with the example content and the default config
// (no comment / weather / music / counter services configured).

const TAGS_POST = '/posts/4d5e6f70/';
const CODE_POST = '/posts/3c4d5e6f/';

/** Never let a test depend on third-party services. */
async function offline(page: Page) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
}

test.beforeEach(async ({ page }) => offline(page));

test('home lists the example posts and the aside cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#recent-posts article')).toHaveCount(4);
  for (const card of ['.card-info', '.card-announcement', '.card-categories', '.card-tags', '.card-archives', '.card-webinfo']) {
    await expect(page.locator(card)).toBeVisible();
  }
});

test('unconfigured services stay out of the page', async ({ page }) => {
  await page.goto(TAGS_POST);
  await expect(page.locator('#post-comment')).toHaveCount(0); // no Twikoo envId
  await expect(page.locator('.card-newest-comments')).toHaveCount(0);
  await expect(page.locator('#global-music')).toHaveCount(0); // no playlist id
  await expect(page.locator('[data-bsz]')).toHaveCount(0); // busuanzi off
  await page.goto('/');
  await expect(page.locator('[data-clock-hm]')).not.toHaveText('--:--'); // clock still ticks
  await expect(page.locator('[data-wx-weather]')).toBeHidden(); // but no weather without a key
});

test('post page: meta, TOC and every tag plugin render', async ({ page }) => {
  await page.goto(TAGS_POST);
  await expect(page.locator('.post-title')).toHaveText('标签外挂示例');
  await expect(page.locator('#card-toc a, .card-toc a').first()).toBeVisible();
  for (const sel of ['.note.info', '.note.success', '.note.primary', '.note.warning', '.note.danger', '.note.icon-padding', '.tip.bolt', 'details.folding-tag', '.tabs', 'span.p.red', '.checkbox.checked', '.psw', '.bubble-content', 'a.site-card']) {
    await expect(page.locator(`#article-container ${sel}`).first(), sel).toBeAttached();
  }
});

test('mermaid diagrams draw and follow the theme', async ({ page }) => {
  const elk: string[] = [];
  page.on('request', (r) => /\/elk-[^/]*\.js$/.test(r.url()) && elk.push(r.url()));
  await page.goto('/posts/2b3c4d5e/');
  const diagram = page.locator('.mermaid-diagram').first();
  await diagram.scrollIntoViewIfNeeded();
  await expect(diagram.locator('svg')).toBeVisible({ timeout: 20_000 });
  await expect(diagram).toHaveAttribute('data-rendered', 'default');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await expect(diagram).toHaveAttribute('data-rendered', 'dark', { timeout: 10_000 });
  // Mermaid 12 defaults to ELK (~1.5 MB); the examples only need dagre.
  expect(elk).toEqual([]);
});

test('tabs switch by click and arrow keys', async ({ page }) => {
  await page.goto(TAGS_POST);
  const tabs = page.locator('.tabs').first();
  const second = tabs.getByRole('tab').nth(1);
  await second.click();
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab').nth(2)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.locator('[role=tabpanel]').nth(2)).toBeVisible(); // hidden panels drop out of getByRole
  await expect(tabs.locator('[role=tabpanel]').nth(0)).toBeHidden();
});

test('long code blocks clamp and expand', async ({ page }) => {
  await page.goto(CODE_POST);
  const block = page.locator('.expressive-code.has-expand').first();
  const pre = block.locator('pre');
  await expect(block).toHaveClass(/is-limited/);
  expect((await pre.boundingBox())!.height).toBeLessThanOrEqual(361);
  await block.locator('.code-expand').click();
  await expect(block).not.toHaveClass(/is-limited/);
  expect(await pre.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
});

test('dark mode toggles and is remembered', async ({ page }) => {
  await page.goto('/');
  const start = await page.locator('html').getAttribute('data-theme');
  await page.evaluate(() => window.scrollTo(0, 400));
  await expect(page.locator('html')).toHaveClass(/show-rightside/); // the buttons slide in after scrolling
  await page.locator('[data-rightside-config]').click();
  await page.locator('[data-darkmode]').click();
  const next = start === 'dark' ? 'light' : 'dark';
  await expect(page.locator('html')).toHaveAttribute('data-theme', next);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', next);
});

test('site search finds a post', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-search-open]').first().click();
  await page.locator('[data-search-input]').fill('标签外挂');
  await expect(page.locator('[data-search-results] a', { hasText: '标签外挂示例' }).first()).toBeVisible();
});

test('search: a cleared query never renders its late results', async ({ page }) => {
  // Result details load slowly, so they arrive after the input has been cleared.
  await page.route('**/pagefind/fragment/**', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue().catch(() => {});
  });
  await page.goto('/');
  await page.locator('[data-search-open]').first().click();
  const input = page.locator('[data-search-input]');
  const stats = page.locator('[data-search-stats]');
  await input.fill('标签外挂');
  await expect(stats).toContainText('找到'); // searched; its details are still loading
  await input.fill('');
  await expect(stats).toHaveText('');
  await page.waitForTimeout(2500); // past the slow details
  await expect(page.locator('[data-search-results] li')).toHaveCount(0);
  await expect(page.locator('[data-search-more]')).toBeHidden();
});

test('feed, sitemap, robots and manifest are generated', async ({ request }) => {
  const feed = await (await request.get('/atom.xml')).text();
  expect(feed.match(/<entry>/g)).toHaveLength(4);
  expect(await (await request.get('/sitemap.xml')).text()).toContain('/posts/1a2b3c4d/');
  expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap:');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBeTruthy();
});

test('unknown URLs get the 404 page', async ({ page }) => {
  const res = await page.goto('/no-such-page/');
  expect(res?.status()).toBe(404);
});

test('mobile layout has no horizontal scroll @mobile', async ({ page }) => {
  for (const path of ['/', TAGS_POST, CODE_POST]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
  }
});

test('navigation never jumps between the page flow and its fixed position @mobile', async ({ page }) => {
  await page.goto('/posts/2b3c4d5e/');
  const nav = page.locator('#nav');
  const scrollTo = async (top: number) => {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top);
    // scroll.ts works in rAF: wait for it, then for a frame showing the result.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  };
  const box = () => nav.evaluate((el) => {
    const { top, bottom } = el.getBoundingClientRect();
    return { top: Math.round(top), bottom: Math.round(bottom), position: getComputedStyle(el).position };
  });

  // Down: still riding with the page, then fixed out of view with no flash back on screen.
  const height = (await box()).bottom;
  await scrollTo(height - 10);
  expect(await box()).toMatchObject({ top: 10 - height, bottom: 10 });
  await scrollTo(height + 40);
  await expect(page.locator('html')).not.toHaveClass(/nav-visible/);
  expect((await box()).bottom).toBeLessThanOrEqual(0);

  // Up: slides in, then stays put all the way to the top instead of snapping into the flow.
  await scrollTo(600);
  await scrollTo(400);
  await expect(page.locator('html')).toHaveClass(/nav-visible/);
  await expect.poll(async () => (await box()).top).toBe(0);
  await scrollTo(20);
  expect(await box()).toMatchObject({ top: 0, position: 'fixed' });
  await scrollTo(0);
  expect((await box()).top).toBe(0);
  expect((await box()).position).not.toBe('fixed');
  await expect(page.locator('html')).not.toHaveClass(/nav-fixed/);

  // A movement under the tolerance is not a change of direction.
  await scrollTo(600);
  await scrollTo(900);
  await expect(page.locator('html')).not.toHaveClass(/nav-visible/);
  await scrollTo(898);
  await expect(page.locator('html')).not.toHaveClass(/nav-visible/);
});

test('fixed navigation stays above cards after scrolling down then up @mobile', async ({ page }) => {
  for (const path of ['/', TAGS_POST]) {
    await page.goto(path);
    const headerHeight = await page.locator('#page-header').evaluate((el) => el.getBoundingClientRect().height);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await page.evaluate(() => window.scrollTo({ top: 1100, behavior: 'instant' }));
      await expect(page.locator('html')).toHaveClass(/nav-fixed/);
      await expect(page.locator('html')).not.toHaveClass(/nav-visible/);
      await page.evaluate(() => window.scrollBy({ top: -300, behavior: 'instant' }));
      await expect(page.locator('html')).toHaveClass(/nav-visible/);
      expect(await page.locator('#page-header').evaluate((el) => el.getBoundingClientRect().height)).toBe(headerHeight);
      // Hit-test the real painted layer, rather than comparing z-index numbers.
      await expect.poll(() => page.locator('#nav').evaluate((nav) => {
        const box = nav.getBoundingClientRect();
        if (Math.abs(box.top) > 1) return false;
        return [0.25, 0.5, 0.75].every((x) => nav.contains(
          document.elementFromPoint(box.left + box.width * x, box.top + box.height / 2),
        ));
      })).toBe(true);
    }
  }
});
