import { expect, test, type Page } from '@playwright/test';

const api = 'https://busuanzi.ibruce.info/busuanzi?*';

async function mockCounters(page: Page, origin: string) {
  await page.route((url) => url.origin !== origin, (route) => route.abort());
  await page.route((url) => url.origin === origin && ['/', '/archives/'].includes(url.pathname), async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace(/<body\b([^>]*)>/, (_, attrs: string) =>
        `<body${attrs.replace(/\sdata-busuanzi(?:="")?/, '')} data-busuanzi>`)
      .replace('</main>', [
        '<a href="#test-visits" id="test-anchor">Go to counter</a>',
        '<span id="test-visits" data-bsz="page_pv" aria-busy="true">…</span>',
        '<span id="test-visitors" data-bsz="site_uv" aria-busy="true">…</span>',
        '<span id="test-site-views" data-bsz="site_pv" aria-busy="true">…</span>',
        '</main>',
      ].join(''));
    await route.fulfill({ response, body });
  });
}

test('counts each Astro page once and releases a previous page request', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await mockCounters(page, origin);

  let markFirstRequested!: (callback: string) => void;
  const firstRequested = new Promise<string>((resolve) => { markFirstRequested = resolve; });
  let releaseFirst!: () => void;
  const firstMayReply = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const requests: string[] = [];
  await page.route(api, async (route) => {
    const referer = new URL(route.request().headers().referer);
    const callback = new URL(route.request().url()).searchParams.get('jsonpCallback')!;
    requests.push(referer.pathname);
    if (referer.pathname === '/' && requests.length === 1) {
      markFirstRequested(callback);
      await firstMayReply;
      await route.fulfill({
        contentType: 'application/json',
        body: `try{${callback}({page_pv: 111});}catch(e){}`,
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: `try{${callback}({page_pv: ${referer.pathname === '/' ? 333 : 222}, site_uv: 12, site_pv: 1234});}catch(e){}`,
    });
  });

  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const firstCallback = await firstRequested;
    await page.locator('#nav a[href="/archives/"]').click();
    await expect(page).toHaveURL(/\/archives\/$/);
    const counter = page.locator('#test-visits');
    await expect(counter).toHaveText('222');
    await expect(page.locator('#test-visitors')).toHaveText('12');
    await expect(page.locator('#test-site-views')).toHaveText('1,234');
    expect(await page.evaluate((callback) => Reflect.has(window, callback), firstCallback)).toBe(false);
    releaseFirst();

    await page.locator('#test-anchor').click();
    await expect(page).toHaveURL(/\/archives\/#test-visits$/);
    await expect(counter).toHaveText('222');
    await page.goBack();
    await expect(page).toHaveURL(/\/archives\/$/);
    await page.goBack();
    await expect(page).toHaveURL(`${origin}/`);
    await expect(page.locator('#test-visits')).toHaveText('333');
    expect(requests).toEqual(['/', '/archives/', '/']);
  } finally {
    releaseFirst();
  }
});

for (const [name, payload, expected] of [
  ['a partial response', '{page_pv: 0, site_uv: -1}', '0'],
  ['a response without a callback', null, '—'],
] as const) {
  test(`settles all counters after ${name}`, async ({ page, baseURL }) => {
    await mockCounters(page, new URL(baseURL!).origin);
    await page.route(api, async (route) => {
      const callback = new URL(route.request().url()).searchParams.get('jsonpCallback');
      await route.fulfill({
        contentType: 'application/javascript',
        body: payload ? `${callback}(${payload});` : 'void 0;',
      });
    });

    await page.goto('/');
    await expect(page.locator('#test-visits')).toHaveText(expected, { timeout: 3000 });
    await expect(page.locator('#test-visitors')).toHaveText('—', { timeout: 3000 });
    await expect(page.locator('#test-site-views')).toHaveText('—', { timeout: 3000 });
    await expect(page.locator('#test-visits, #test-visitors, #test-site-views').and(page.locator('[aria-busy]'))).toHaveCount(0);
    await expect(page.locator('script[src*="jsonpCallback"]')).toHaveCount(0);
  });
}
