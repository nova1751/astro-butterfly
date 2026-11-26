// @ts-check
import { defineConfig } from 'astro/config';
import expressiveCode from 'astro-expressive-code';
import { unified } from '@astrojs/markdown-remark';
import icon from 'astro-icon';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkAlerts from './src/plugins/remark-alerts.ts';
import remarkDirectives from './src/plugins/remark-directives.ts';
import remarkReading from './src/plugins/remark-reading.ts';
import remarkMermaid from './src/plugins/remark-mermaid.ts';
import rehypeContent from './src/plugins/rehype-content.ts';
import { shellIconCss, contentIconCss } from './src/theme/icons-css.ts';
import { site } from './src/config.ts';

/** @type {Record<string, string>} */
const ICON_CSS = {
  'virtual:icons-shell.css': shellIconCss,
  'virtual:icons-content.css': contentIconCss,
};

/** Emit CSS icon masks as hashed, cacheable stylesheets instead of inlining into every HTML <head>. */
function virtualIconCss() {
  return {
    name: 'virtual-icon-css',
    /** @param {string} id */
    resolveId(id) {
      if (id in ICON_CSS) return `\0${id}`;
    },
    /** @param {string} id */
    load(id) {
      if (id.startsWith('\0') && id.slice(1) in ICON_CSS) return ICON_CSS[id.slice(1)];
    },
  };
}

export default defineConfig({
  // SITE_URL / BASE_PATH let CI build a preview for another host (see .github/workflows/pages.yml)
  site: process.env.SITE_URL || site.url,
  base: process.env.BASE_PATH || site.base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  // Markdown images get a srcset, so phones don't download the full-width file
  image: { layout: 'constrained' },
  vite: {
    plugins: [virtualIconCss()],
  },
  integrations: [
    // must come before any MDX integration; config lives in ec.config.mjs
    expressiveCode(),
    icon({ iconDir: 'src/theme/icons' }),
  ],
  markdown: {
    processor: unified({
      smartypants: false,
      remarkPlugins: [remarkMath, remarkDirective, remarkDirectives, remarkMermaid, remarkAlerts, remarkReading],
      rehypePlugins: [[rehypeKatex, { strict: false, throwOnError: false }], [rehypeContent, { base: process.env.BASE_PATH || site.base }]],
    }),
  },
});
