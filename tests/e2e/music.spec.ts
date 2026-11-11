import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';

const require = createRequire(import.meta.url);

test('the first click animates the fixed player open @mobile', async ({ page, isMobile }) => {
  await page.route('**/test-playlist', (route) => route.fulfill({
    json: [{ name: 'Track', url: 'data:audio/mpeg,' }],
  }));
  await page.addInitScript(() => {
    // The theme ships with the global player disabled. Give the real initializer a playlist.
    document.addEventListener('DOMContentLoaded', () => {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="global-music" data-global-music data-api="/test-playlist">
          <button type="button" data-music-start aria-label="展开音乐播放器">›</button>
        </div>`);
    });
    document.addEventListener('transitionrun', (event) => {
      const target = event.target;
      if (event.propertyName === 'width' && target instanceof HTMLElement && target.matches('#global-music .aplayer-body')) {
        target.dataset.widthTransition = '';
      }
    });
  });

  await page.goto('/');
  const player = page.locator('#global-music');
  await player.getByRole('button', { name: '展开音乐播放器' }).click();
  await expect(player).toHaveAttribute('data-state', 'ready');
  const body = player.locator('.aplayer-body');
  await expect(body).toHaveAttribute('data-width-transition', '');
  const expectedWidth = isMobile ? page.viewportSize()!.width : 400;
  await expect.poll(() => body.evaluate((el) => el.getBoundingClientRect().width))
    .toBe(expectedWidth);
});

test('the fixed player keeps its hover preview stable and tucks back to the tab', async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.goto('/');
  await page.addStyleTag({ path: require.resolve('aplayer/dist/APlayer.min.css') });
  await page.addScriptTag({ path: require.resolve('aplayer/dist/APlayer.min.js') });
  await page.evaluate(() => {
    const container = document.createElement('div');
    container.id = 'global-music';
    container.className = 'ap-init';
    document.body.append(container);
    const { APlayer } = window as unknown as { APlayer: new (options: object) => unknown };
    new APlayer({ container, fixed: true, audio: [{ name: 'Track', url: 'data:audio/mpeg,' }] });
    void container.offsetWidth;
    container.classList.remove('ap-init');
  });

  const player = page.locator('#global-music');
  const body = player.locator('.aplayer-body');
  const bottom = page.viewportSize()!.height;
  const rightEdge = () => body.evaluate((el) => el.getBoundingClientRect().right);
  const hitsPlayer = (x: number, y: number) => page.evaluate(
    ([x, y]) => !!document.elementFromPoint(x, y)?.closest('#global-music'),
    [x, y],
  );

  await expect.poll(rightEdge).toBe(19);
  expect(await hitsPlayer(76, bottom - 34)).toBe(false);

  await page.mouse.move(8, bottom - 34);
  await expect.poll(rightEdge).toBe(85);
  await page.mouse.move(84, bottom - 65); // rounded top corner of the preview
  expect(await hitsPlayer(84, bottom - 65)).toBe(true);
  await expect.poll(rightEdge).toBe(85);

  await page.mouse.move(140, bottom - 34);
  await expect.poll(rightEdge).toBe(19);
  expect(await hitsPlayer(76, bottom - 34)).toBe(false);

  await page.mouse.move(8, bottom - 34);
  await expect.poll(rightEdge).toBe(85);
  await player.locator('.aplayer-miniswitcher').click();
  await expect(player).not.toHaveClass(/aplayer-narrow/);
  await player.locator('.aplayer-miniswitcher').click();
  await expect(player).toHaveClass(/aplayer-narrow/);

  await page.mouse.move(140, bottom - 34);
  await expect.poll(rightEdge).toBe(19);
  expect(await hitsPlayer(76, bottom - 34)).toBe(false);
});
