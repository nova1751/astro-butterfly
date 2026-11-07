/**
 * Site-specific LXGW WenKai Screen webfont.
 *
 * The npm package splits the font by general Chinese frequency into 97 chunks,
 * so one page of this blog touches 60-70 of them (~3.4 MB). This script reads
 * every post, page and UI string, orders the characters by how often *this*
 * site uses them and cuts a handful of chunks from the full font:
 *
 *   chunk 0  all UI text + the most frequent characters (~1000), preloaded
 *   chunk 1+ the rest of the site's characters, by frequency
 *
 * The generated CSS imports the npm package first and declares these chunks
 * after it. For faces of one family whose unicode-ranges overlap, browsers
 * try the last declared first, so text on the site only ever loads these
 * chunks; characters that appear nowhere on the site (a rare one in a comment)
 * still fall back to the original chunks instead of a system font.
 *
 * Runs before `astro dev/build/check` and regenerates only when the set of
 * characters changes. If the full font can't be downloaded, it writes a CSS
 * that just imports the npm package (the previous behaviour).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import subsetFont from 'subset-font';

const FONT_VERSION = 'v1.530';
const FONT_URL = `https://github.com/lxgw/LxgwWenKai-Screen/releases/download/${FONT_VERSION}/LXGWWenKaiGBScreen.ttf`;
const FONT_CACHE = `node_modules/.cache/lxgw/LXGWWenKaiGBScreen-${FONT_VERSION}.ttf`;
const OUT_DIR = 'public/fonts/lxgw'; // served as /fonts/lxgw/*
const GEN_DIR = 'src/theme/generated';
const FAMILY = 'LXGW WenKai Screen';
const FIRST_CHUNK = 1000;
const CHUNK = 500;
const SCRIPT_VERSION = 1; // bump when the chunking logic changes

const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? (f === 'generated' ? [] : walk(p)) : [p];
      })
    : [];

const count = (files, freq) => {
  for (const f of files) for (const ch of readFileSync(f, 'utf8')) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  return freq;
};

const isText = (ch) => {
  const cp = ch.codePointAt(0);
  return cp >= 0x20 && !(cp >= 0xd800 && cp <= 0xdfff) && !(cp >= 0xfe00 && cp <= 0xfe0f);
};

// UI strings (components, config) appear on every page: always in chunk 0.
// zh-map.ts is the simplified -> traditional table; traditional text only shows
// after a visitor switches, and the fallback chunks cover it then.
const NOT_UI = ['zh-map.ts'];
const ui = count(
  walk('src').filter((f) => ['.astro', '.ts', '.mjs', '.css', '.json'].includes(extname(f)) && !NOT_UI.some((n) => f.endsWith(n))),
  new Map(),
);
const content = count([...walk('source'), ...walk('src/content')].filter((f) => extname(f) === '.md'), new Map());
for (let cp = 0x20; cp < 0x7f; cp++) ui.set(String.fromCodePoint(cp), Infinity); // ASCII always

const uiChars = [...ui.keys()].filter(isText);
const rest = [...content.entries()]
  .filter(([ch]) => isText(ch) && !ui.has(ch))
  .sort((a, b) => b[1] - a[1] || a[0].codePointAt(0) - b[0].codePointAt(0))
  .map(([ch]) => ch);

const head = [...uiChars, ...rest.splice(0, Math.max(0, FIRST_CHUNK - uiChars.length))];
const chunks = [head];
while (rest.length) chunks.push(rest.splice(0, CHUNK));

const key = createHash('sha256')
  .update(JSON.stringify([SCRIPT_VERSION, FONT_VERSION, chunks.map((c) => [...c].sort().join(''))]))
  .digest('hex')
  .slice(0, 16);

try {
  await buildFont();
} catch (e) {
  // The original npm font is always shipped, so font optimization is optional.
  mkdirSync(GEN_DIR, { recursive: true });
  writeOutputs(undefined);
  console.warn(`[font] optimization failed: ${e.message}; using the original npm font chunks`);
}

async function buildFont() {
  mkdirSync(GEN_DIR, { recursive: true });
  const manifestPath = join(OUT_DIR, 'manifest.json');
  const previous = readManifest(manifestPath);
  if (previous?.key === key) {
    writeOutputs(previous);
    console.log(`[font] up to date (${previous.files.length} chunks)`);
    return;
  }

  const font = await loadFont();
  if (!font) {
    writeOutputs(undefined);
    console.warn('[font] full font unavailable; falling back to the npm package chunks');
    return;
  }

  const started = Date.now();
  // Prepare every subset before replacing any outputs; keep old files usable on failure.
  const files = [];
  const buffers = [];
  for (const [i, chars] of chunks.entries()) {
    let woff2;
    try {
      woff2 = await subsetFont(font, chars.join(''), { targetFormat: 'woff2' });
    } catch (e) {
      // Discard a corrupt source cache so the next build can download a fresh font.
      rmSync(FONT_CACHE, { force: true });
      throw e;
    }
    const file = `${i}.${createHash('sha256').update(woff2).digest('hex').slice(0, 8)}.woff2`;
    buffers.push(woff2);
    files.push({ file, range: unicodeRange(chars), chars: chars.length, bytes: woff2.length });
  }
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [i, file] of files.entries()) writeFileSync(join(OUT_DIR, file.file), buffers[i]);
  const manifest = { key, font: FONT_VERSION, files };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  writeOutputs(manifest);
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(
    `[font] ${files.length} chunks in ${((Date.now() - started) / 1000).toFixed(1)}s: ` +
      files.map((f) => `${f.chars} chars ${kb(f.bytes)}`).join(', '),
  );
}

function readManifest(path) {
  if (!existsSync(path)) return undefined;
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error('empty font manifest');
    for (const f of manifest.files) {
      if (!/^\d+\.[a-f0-9]{8}\.woff2$/.test(f.file)) throw new Error('invalid font filename');
      const data = readFileSync(join(OUT_DIR, f.file));
      if (data.length !== f.bytes || data.toString('ascii', 0, 4) !== 'wOF2') throw new Error('damaged font chunk');
    }
    return manifest;
  } catch (e) {
    console.warn(`[font] ignoring damaged cache: ${e.message}`);
    return undefined;
  }
}

async function loadFont() {
  if (existsSync(FONT_CACHE)) return readFileSync(FONT_CACHE);
  try {
    console.log(`[font] downloading ${FONT_URL}`);
    const res = await fetch(FONT_URL, { signal: AbortSignal.timeout(180_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    mkdirSync(join(FONT_CACHE, '..'), { recursive: true });
    writeFileSync(FONT_CACHE, buf);
    return buf;
  } catch (e) {
    console.warn(`[font] download failed: ${e.message}`);
    return undefined;
  }
}

function unicodeRange(chars) {
  const cps = [...new Set(chars.map((c) => c.codePointAt(0)))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < cps.length; i++) {
    let j = i;
    while (j + 1 < cps.length && cps[j + 1] === cps[j] + 1) j++;
    const hex = (n) => n.toString(16);
    out.push(i === j ? `U+${hex(cps[i])}` : `U+${hex(cps[i])}-${hex(cps[j])}`);
    i = j;
  }
  return out.join(',');
}

function writeOutputs(manifest) {
  const faces = (manifest?.files ?? []).map(
    (f) =>
      `@font-face{font-family:'${FAMILY}';font-style:normal;font-weight:400;font-display:swap;` +
      `src:url('/fonts/lxgw/${f.file}') format('woff2');unicode-range:${f.range}}`,
  );
  writeFileSync(
    join(GEN_DIR, 'lxgw.css'),
    [
      '/* generated by scripts/build-font.mjs — do not edit */',
      "@import 'lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css';",
      ...faces,
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(GEN_DIR, 'font.json'),
    JSON.stringify({ preload: manifest ? `/fonts/lxgw/${manifest.files[0].file}` : null }, null, 2) + '\n',
  );
}
