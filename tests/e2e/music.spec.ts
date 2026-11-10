import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';

const require = createRequire(import.meta.url);

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
