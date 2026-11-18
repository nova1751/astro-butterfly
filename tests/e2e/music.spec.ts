import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';

const require = createRequire(import.meta.url);

test('switching tracks scrolls from the playlist position and follows the latest track @mobile', async ({ page }) => {
  await page.route('http://aplayer.test/', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<meta name="viewport" content="width=device-width"><div style="height: 2400px"><div id="player" style="position: fixed; top: 0; width: 280px"></div></div>',
  }));
  await page.goto('http://aplayer.test/');
  await page.addStyleTag({ path: require.resolve('aplayer/dist/APlayer.min.css') });
  await page.addStyleTag({ content: '.aplayer .aplayer-list ol li { height: 42px; }' });
  await page.addScriptTag({ path: require.resolve('aplayer/dist/APlayer.min.js') });

  const result = await page.evaluate(async () => {
    const { APlayer } = window as unknown as {
      APlayer: new (options: object) => { list: { show(): void; switch(index: number): void } };
    };
    const container = document.querySelector<HTMLElement>('#player')!;
    const player = new APlayer({
      container,
      listMaxHeight: '260px',
      preload: 'none',
      audio: Array.from({ length: 40 }, (_, i) => ({ name: `Track ${i}`, url: 'data:audio/mpeg,' })),
    });
    const list = container.querySelector<HTMLOListElement>('ol')!;
    const aligned = (index: number) =>
      Math.abs(list.children[index].getBoundingClientRect().top - list.getBoundingClientRect().top) < 1;
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    player.list.show();
    window.scrollTo(0, 700);
    player.list.switch(18);
    for (let i = 0; i < 90 && !aligned(18); i++) await frame();
    const firstTrackAligned = aligned(18);

    player.list.switch(10);
    await frame();
    player.list.switch(4);
    const positions: number[] = [];
    for (let i = 0; i < 90 && !aligned(4); i++) {
      positions.push(list.scrollTop);
      await frame();
    }
    const lastTrackAligned = aligned(4);
    const stayedUpward = positions.every((top, i) => i === 0 || top <= positions[i - 1]);

    list.scrollTop = 0;
    player.list.switch(2);
    await frame();
    const initialScroll = list.scrollTop;
    player.list.show();
    return { firstTrackAligned, lastTrackAligned, stayedUpward, initialScroll, pageScroll: window.scrollY, aligned: aligned(2) };
  });

  expect(result).toMatchObject({ firstTrackAligned: true, lastTrackAligned: true, stayedUpward: true, pageScroll: 700, aligned: true });
  expect(result.initialScroll).toBeLessThan(84);
});

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
      if (!(target instanceof HTMLElement) || !target.matches('#global-music .aplayer-body')) return;
      if (event.propertyName === 'width') target.dataset.widthTransition = '';
      if (event.propertyName !== 'left') return;
      const slide = target.getAnimations().find((animation) =>
        animation instanceof CSSTransition && animation.transitionProperty === 'left',
      );
      const firstFrame = (slide?.effect as KeyframeEffect | undefined)?.getKeyframes()[0];
      if (typeof firstFrame?.left === 'string') target.dataset.slideFrom = firstFrame.left;
    });
  });

  await page.goto('/');
  const player = page.locator('#global-music');
  await player.getByRole('button', { name: '展开音乐播放器' }).click();
  await expect(player).toHaveAttribute('data-state', 'ready');
  const body = player.locator('.aplayer-body');
  await expect(body).toHaveAttribute('data-width-transition', '');
  await expect(body).toHaveAttribute('data-slide-from', '-66px');
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
