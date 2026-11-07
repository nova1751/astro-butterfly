import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Retry once with optional remote-image optimization disabled. Never accept a failed retry. */
export function buildSite(run = (env) => spawnSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/astro/bin/astro.mjs', import.meta.url)), 'build',
], { stdio: 'inherit', env })) {
  let result = run(process.env);
  if (result.signal || result.error) {
    if (result.error) console.error(result.error);
    return 1;
  }
  if (result.status === 0) return 0;
  if (process.env.BLOG_DISABLE_IMAGE_OPTIMIZATION === '1') return result.status ?? 1;
  console.warn('[build] Build failed. Retrying once with remote images left at their original URLs.');
  result = run({ ...process.env, BLOG_DISABLE_IMAGE_OPTIMIZATION: '1' });
  if (result.error) console.error(result.error);
  if (result.status === 0) {
    console.warn('[build] Completed with image optimization disabled. Check the errors above before the next build.');
  }
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = buildSite();
}
