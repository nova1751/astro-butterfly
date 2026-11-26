/**
 * Site-specific LXGW WenKai Screen webfont.
 *
 * The npm package splits the font by general Chinese frequency into 97 chunks,
 * so one page of this blog touches 60-70 of them (~3.4 MB). This script reads
 * every post, page and UI string, orders the characters by how often *this*
 * site uses them and cuts a handful of chunks from the full font:
 *
 *   chunk 0  ASCII, common spaces, UI, post metadata and home excerpts (preloaded)
 *   chunk 1+ the rest of the site's characters, by frequency (post bodies)
 *
 * Keep the shell in one file because the homepage uses both UI and post text.
 * Body faces live in body.css, which fallback-font.ts adds after the first
 * paint. The browser fetches a body chunk only when its characters are used.
 *
 * Runs before `astro dev/build/check` and regenerates only when the set of
 * characters changes. If the full font can't be downloaded, it writes a CSS
 * that just imports the npm package (the previous behaviour).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import subsetFont from 'subset-font';
import { plainExcerpt } from '../src/lib/excerpt-text.mjs';

const FONT_VERSION = 'v1.530';
const FONT_URL = `https://github.com/lxgw/LxgwWenKai-Screen/releases/download/${FONT_VERSION}/LXGWWenKaiGBScreen.ttf`;
const FONT_CACHE = `node_modules/.cache/lxgw/LXGWWenKaiGBScreen-${FONT_VERSION}.ttf`;
const OUT_DIR = 'public/fonts/lxgw'; // served as /fonts/lxgw/*
const GEN_DIR = 'src/theme/generated';
const FAMILY = 'LXGW WenKai Screen';
// The font's hhea line metrics, stated so every platform uses them. Windows
// otherwise reads usWin (1.048 / .271): the same text sits ~0.05em lower in
// its line box there, CJK ink below centre, and the LED readings of the aside
// clock (which use these values) no longer share its line box.
const METRICS = 'ascent-override:92.8%;descent-override:24.4%;line-gap-override:0%;';
// Most of the body vocabulary is shared across articles.
const CHUNK = 1500;
const HOME_POSTS = 12; // pagination.home
const SCRIPT_VERSION = 7; // bump when the chunking logic changes

// Common Chinese administrative place-name characters (provinces, prefecture-level
// cities and suffixes). Kept as a separate lazy chunk in body.css so desktop visitors
// seeing their city in the aside clock never trigger the 97-rule fallback.css (~111 KB).
const PLACES =
  '省市区县自治州盟旗新区岛湾港澳台京津沪渝冀晋辽吉黑苏浙皖闽赣鲁豫鄂湘粤琼川贵云陕甘青藏蒙桂宁新' +
  '北京天津上海重庆河北石家庄唐山秦皇岛邯郸邢台保定张家口承德沧州廊坊衡水' +
  '山西太原大同阳泉长治晋城朔州晋中运城忻州临汾吕梁' +
  '内蒙古呼和浩特包头乌海赤峰通辽鄂尔多斯呼伦贝尔巴彦淖尔乌兰察布兴安锡林郭勒阿拉善' +
  '辽宁沈阳大连鞍山抚顺本溪丹东锦州营口阜新辽阳盘锦铁岭朝阳葫芦岛' +
  '吉林长春四平辽源通化白山松原白城延边朝鲜族' +
  '黑龙江哈尔滨齐齐哈尔鸡西鹤岗双鸭山大庆伊春佳木斯七台河牡丹江黑河绥化大兴安岭' +
  '江苏南京无锡徐州常州苏州南通连云港淮安盐城扬州镇江泰州宿迁' +
  '浙江杭州宁波温州嘉兴湖州绍兴金华衢州舟山台州丽水' +
  '安徽合肥芜湖蚌埠淮南马鞍山淮北铜陵安庆黄山滁州阜阳宿州六安亳州池州宣城' +
  '福建福州厦门莆田三明泉州漳州南平龙岩宁德' +
  '江西南昌景德镇萍乡九江新余鹰潭赣州吉安宜春抚州上饶' +
  '山东济南青岛淄博枣庄东营烟台潍坊济宁泰安威海日照临沂德州聊城滨州菏泽' +
  '河南郑州开封洛阳平顶山安阳鹤壁新乡焦作濮阳许昌漯河三门峡南阳商丘信阳周口驻马店济源' +
  '湖北武汉黄石十堰宜昌襄阳鄂州荆门孝感荆州黄冈咸宁随州恩施仙桃潜江天门神农架' +
  '湖南长沙株洲湘潭衡阳邵阳岳阳常德张家界益阳郴州永州怀化娄底湘西' +
  '广东广州韶关深圳珠海汕头佛山江门湛江茂名肇庆惠州梅州汕尾河源阳江清远东莞中山潮州揭阳云浮' +
  '广西南宁柳州桂林梧州北海防城港钦州贵港玉林百色贺州河池来宾崇左' +
  '海南海口三亚三沙儋州五指山琼海文昌万宁东方' +
  '四川成都自贡攀枝花泸州德阳绵阳广元遂宁内江乐山南充眉山宜宾广安达州雅安巴中资阳阿坝甘孜凉山' +
  '贵州贵阳六盘水遵义安顺毕节铜仁黔西南黔东南黔南' +
  '云南昆明曲靖玉溪保山昭通丽江普洱临沧楚雄红河文山西双版纳大理德宏怒江迪庆' +
  '西藏拉萨日喀则昌都林芝山南那曲阿里' +
  '陕西西安铜川宝鸡咸阳渭南延安汉中榆林安康商洛' +
  '甘肃兰州嘉峪关金昌白银天水武威张掖平凉酒泉庆阳定西陇南临夏甘南' +
  '青海西宁海东海北黄南海西果洛玉树' +
  '宁夏银川石嘴山吴忠固原中卫' +
  '新疆乌鲁木齐克拉玛依吐鲁番哈密昌吉博尔塔拉巴音郭楞阿克苏克孜勒苏喀什和田伊犁塔城阿勒泰' +
  '香港澳门台湾台北新北桃园台中台南高雄基隆新竹嘉义';

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

// UI strings are part of the preloaded shell.
// zh-map.ts is the simplified -> traditional table; traditional text only shows
// after a visitor switches, and the fallback chunks cover it then.
const NOT_UI = ['zh-map.ts'];
const ui = count(
  walk('src').filter((f) => ['.astro', '.ts', '.mjs', '.css', '.json'].includes(extname(f)) && !NOT_UI.some((n) => f.endsWith(n))),
  new Map(),
);
// Posts and pages: src/content/ by default, source/ when pointed at a Hexo blog.
const content = count([...walk('source'), ...walk('src/content')].filter((f) => extname(f) === '.md'), new Map());
for (let cp = 0x20; cp < 0x7f; cp++) ui.set(String.fromCodePoint(cp), Infinity); // ASCII always

// Spaces Markdown and typography produce (nbsp, thin / zero-width spaces). Left
// out of the shell, each one would pull a whole ~60 KB chunk of the fallback font.
for (const cp of [0xa0, 0x2002, 0x2003, 0x2009, 0x200a, 0x200b, 0x200c, 0x200d, 0x2060, 0x3000]) {
  ui.set(String.fromCodePoint(cp), Infinity);
}

// Shell text that every page or the home page shows, read from the sources (not
// from a previous build, so local and CI builds agree): titles, tags and
// categories of every post (cards, aside, archives, related posts) and the
// opening of the newest posts (home page excerpts).
const posts = [...walk('source/_posts'), ...walk('src/content/posts')]
  .filter((f) => extname(f) === '.md')
  .map((f) => {
    const text = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    return { fm, body: text.slice(fm.length + 8), date: fm.match(/^date:\s*(.+)$/m)?.[1] ?? '' };
  });
// The aside clock shows QWeather text on every page: its weather descriptions
// and wind directions are a closed set. (City names are open-ended; they load
// after the page anyway and use the fallback chunks.) © comes from `&copy;`.
const WEATHER =
  '晴多云少云晴间多云阴阵雨强阵雨雷阵雨强雷阵雨雷阵雨伴有冰雹小雨中雨大雨极端降雨毛毛雨细雨暴雨大暴雨特大暴雨冻雨' +
  '小到中雨中到大雨大到暴雨暴雨到大暴雨大暴雨到特大暴雨雨雪天气雨夹雪阵雨夹雪小雪中雪大雪暴雪阵雪小到中雪中到大雪大到暴雪' +
  '薄雾雾霾扬沙浮尘沙尘暴强沙尘暴浓雾强浓雾中度霾重度霾严重霾大雾特强浓雾热冷未知' +
  '东南西北偏风无持续旋转不定级天气加载中暂不可用定位©';
const shellText = [
  WEATHER,
  ...posts.flatMap((p) => p.fm.split('\n').filter((l) => /^(title|description):|^\s*-\s/.test(l))),
  ...[...posts]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, HOME_POSTS)
    .map((p) => plainExcerpt(p.body)),
].join('\n');
for (const ch of shellText) if (!ui.has(ch)) ui.set(ch, 1);

const shellChars = [...ui.keys()].filter(isText);
const rest = [...content.entries()]
  .filter(([ch]) => isText(ch) && !ui.has(ch))
  .sort((a, b) => b[1] - a[1] || a[0].codePointAt(0) - b[0].codePointAt(0))
  .map(([ch]) => ch);

const chunks = [shellChars];
while (rest.length) chunks.push(rest.splice(0, CHUNK));
const covered = new Set(chunks.flat());
const placeChars = [...new Set([...PLACES].filter((ch) => isText(ch) && !covered.has(ch)))].sort(
  (a, b) => a.codePointAt(0) - b.codePointAt(0),
);
if (placeChars.length) chunks.push(placeChars);

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

/** Drop chunk files of earlier character sets so they aren't deployed. */
function pruneChunks(manifest) {
  if (!manifest || !existsSync(OUT_DIR)) return;
  const keep = new Set(manifest.files.map((f) => f.file));
  for (const f of readdirSync(OUT_DIR)) if (/^\d+\.[a-f0-9]{8}\.woff2$/.test(f) && !keep.has(f)) rmSync(join(OUT_DIR, f));
}

function writeOutputs(manifest) {
  pruneChunks(manifest);
  const [shell, ...body] = manifest?.files ?? [];
  const face = (f, path) =>
    `@font-face{font-family:'${FAMILY}';font-style:normal;font-weight:400;font-display:swap;${METRICS}` +
    `src:url('${path}') format('woff2');unicode-range:${f.range}}`;
  writeFileSync(
    join(GEN_DIR, 'lxgw.css'),
    [
      '/* generated by scripts/build-font.mjs — do not edit */',
      // Without site chunks, the npm font is the font: load it with the page.
      shell ? face(shell, `/fonts/lxgw/${shell.file}`) : "@import 'lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css';",
      '',
    ].join('\n'),
  );
  if (body.length) writeFileSync(join(OUT_DIR, 'body.css'), body.map((f) => face(f, f.file)).join('\n') + '\n');
  // Only needed next to site chunks; without them lxgw.css imports the npm font itself.
  if (manifest) {
    try {
      writeFallback();
    } catch (e) {
      console.warn(`[font] fallback font not written: ${e.message}`);
    }
  }
  writeFileSync(
    join(GEN_DIR, 'font.json'),
    JSON.stringify({ preload: shell ? `/fonts/lxgw/${shell.file}` : null, body: body.length ? '/fonts/lxgw/body.css' : null }, null, 2) + '\n',
  );
}

/**
 * The full npm font as a separate family, 'LXGW WenKai Screen Fallback', listed
 * after the site family in --font-family (global.css). It only covers text the
 * site's chunks don't: comments, the weather city, search input, traditional
 * Chinese after the switch. None of that is part of the first paint, so the
 * page doesn't link this stylesheet: fallback-font.ts adds it when one of those
 * features runs. Its 97 @font-face rules (~36 KB) never block rendering, and a
 * font file is only fetched when one of its characters shows up. URLs are
 * relative to fallback.css, so a sub-path deploy (`base`) works too.
 */
function writeFallback() {
  const pkg = 'node_modules/lxgw-wenkai-screen-webfont';
  const dir = join(OUT_DIR, 'fallback');
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(join(pkg, 'files')).filter((f) => f.startsWith('lxgwwenkaigbscreen-subset-'))) {
    const src = join(pkg, 'files', f);
    const dest = join(dir, f);
    if (!existsSync(dest) || statSync(dest).size !== statSync(src).size) writeFileSync(dest, readFileSync(src));
  }
  const css = readFileSync(join(pkg, 'lxgwwenkaigbscreen.css'), 'utf8')
    .replace(/font-family:\s*'LXGW WenKai Screen'/g, `font-family: '${FAMILY} Fallback'`)
    .replace(/font-display:\s*swap;/g, `font-display: swap; ${METRICS}`)
    .replace(/url\('\.\/files\//g, "url('fallback/");
  writeFileSync(join(OUT_DIR, 'fallback.css'), css);
}
