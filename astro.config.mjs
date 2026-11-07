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
import rehypeContent from './src/plugins/rehype-content.ts';
import { site } from './src/config.ts';

export default defineConfig({
  // SITE_URL / BASE_PATH let CI build a preview for another host (see .github/workflows/pages.yml)
  site: process.env.SITE_URL || site.url,
  base: process.env.BASE_PATH || site.base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  integrations: [
    // must come before any MDX integration; config lives in ec.config.mjs
    expressiveCode(),
    icon({ iconDir: 'src/theme/icons' }),
  ],
  markdown: {
    processor: unified({
      smartypants: false,
      remarkPlugins: [remarkMath, remarkDirective, remarkDirectives, remarkAlerts, remarkReading],
      rehypePlugins: [[rehypeKatex, { strict: false, throwOnError: false }], [rehypeContent, { base: process.env.BASE_PATH || site.base }]],
    }),
  },
});
