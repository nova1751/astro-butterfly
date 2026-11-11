import { expect, test } from '@playwright/test';

test('a previous page response cannot overwrite the current visit count', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await page.route((url) => url.origin !== origin, (route) => route.abort());
  await page.route((url) => url.origin === origin && ['/', '/archives/'].includes(url.pathname), async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace('<body', '<body data-busuanzi')
      .replace('</main>', '<span id="test-visits" data-bsz="page_pv" aria-busy="true">…</span></main>');
    await route.fulfill({ response, body });
  });

  let markFirstRequested!: () => void;
  const firstRequested = new Promise<void>((resolve) => { markFirstRequested = resolve; });
  let releaseFirst!: () => void;
  const firstMayReply = new Promise<void>((resolve) => { releaseFirst = resolve; });
  await page.route('https://busuanzi.ibruce.info/**', async (route) => {
    const firstPage = new URL(route.request().headers().referer).pathname === '/';
    if (firstPage) {
      markFirstRequested();
      await firstMayReply;
    }
    const callback = new URL(route.request().url()).searchParams.get('jsonpCallback');
    await route.fulfill({
      contentType: 'application/javascript',
      body: `${callback}({ page_pv: ${firstPage ? 111 : 222} });` +
        (firstPage ? 'document.documentElement.dataset.oldVisitResponse = "received";' : ''),
    });
  });

  try {
    await page.goto('/');
    await firstRequested;
    await page.locator('#nav a[href="/archives/"]').click();
    await expect(page).toHaveURL(/\/archives\/$/);
    const counter = page.locator('#test-visits');
    await expect(counter).toHaveText('222');
    releaseFirst();
    await expect(page.locator('html')).toHaveAttribute('data-old-visit-response', 'received');
    await expect(counter).toHaveText('222');
  } finally {
    releaseFirst();
  }
});
