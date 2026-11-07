import { describe, expect, it, vi } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { buildSite } from '../../scripts/build-site.mjs';

const result = (status: number | null, signal: NodeJS.Signals | null = null) =>
  ({ status, signal } as SpawnSyncReturns<Buffer<ArrayBuffer>>);

describe('build fallback', () => {
  it('does not repeat a successful build', () => {
    const run = vi.fn(() => result(0));
    expect(buildSite(run)).toBe(0);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries once without image optimization and preserves other environment values', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const run = vi.fn().mockReturnValueOnce(result(1)).mockReturnValueOnce(result(0));
    try {
      expect(buildSite(run)).toBe(0);
      expect(run).toHaveBeenCalledTimes(2);
      expect(run.mock.calls[1][0]).toEqual({ ...process.env, BLOG_DISABLE_IMAGE_OPTIMIZATION: '1' });
    } finally { warning.mockRestore(); }
  });

  it('fails when the fallback also fails, and never retries an interrupted build', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(buildSite(vi.fn(() => result(7)))).toBe(7);
      const interrupted = vi.fn(() => result(null, 'SIGTERM'));
      expect(buildSite(interrupted)).toBe(1);
      expect(interrupted).toHaveBeenCalledTimes(1);
    } finally { warning.mockRestore(); }
  });

  it('survives damaged font caches, retains old subsets and emits the original-font fallback', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'blog-font-fallback-'));
    try {
      mkdirSync(join(workspace, 'node_modules/.cache/lxgw'), { recursive: true });
      mkdirSync(join(workspace, 'public/fonts/lxgw'), { recursive: true });
      writeFileSync(join(workspace, 'node_modules/.cache/lxgw/LXGWWenKaiGBScreen-v1.530.ttf'), 'damaged font');
      writeFileSync(join(workspace, 'public/fonts/lxgw/manifest.json'), '{broken json');
      writeFileSync(join(workspace, 'public/fonts/lxgw/old.woff2'), 'keep old subset');
      const child = spawnSync(process.execPath, [resolve('scripts/build-font.mjs')], {
        cwd: workspace, encoding: 'utf8', timeout: 20_000,
      });
      expect(child.status, child.stderr).toBe(0);
      expect(child.stderr).toContain('ignoring damaged cache');
      expect(child.stderr).toContain('optimization failed');
      expect(readFileSync(join(workspace, 'src/theme/generated/lxgw.css'), 'utf8')).toContain("@import 'lxgw-wenkai-screen-webfont/");
      expect(JSON.parse(readFileSync(join(workspace, 'src/theme/generated/font.json'), 'utf8')).preload).toBeNull();
      expect(readFileSync(join(workspace, 'public/fonts/lxgw/old.woff2'), 'utf8')).toBe('keep old subset');
    } finally {
      if (!resolve(workspace).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected test directory');
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
