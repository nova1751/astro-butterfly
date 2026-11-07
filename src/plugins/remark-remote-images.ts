import type { Root, Image, Html } from 'mdast';
import { visit } from 'unist-util-visit';
import { isOptimizableRemote, resolveRemoteImage } from '../lib/remote-image';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Markdown images on the allowed image hosts are optimised by Astro (AVIF/WebP,
 * width/height, lazy). Astro fails the whole build if one of them can't be
 * fetched, so check them first:
 *  - reachable: point at the final URL (see remote-image.ts for why)
 *  - unreachable: emit a plain <img> with the original URL, which Astro skips
 */
export default function remarkRemoteImages() {
  return async (tree: Root) => {
    const nodes: { node: Image; index: number; parent: { children: unknown[] } }[] = [];
    visit(tree, 'image', (node, index, parent) => {
      if (parent && index !== undefined && isOptimizableRemote(node.url)) nodes.push({ node, index, parent });
    });
    await Promise.all(
      nodes.map(async ({ node, index, parent }) => {
        const final = await resolveRemoteImage(node.url);
        if (final) {
          node.url = final;
          return;
        }
        const html: Html = { type: 'html', value: `<img src="${esc(node.url)}" alt="${esc(node.alt ?? '')}" loading="lazy" decoding="async">` };
        parent.children[index] = html;
      }),
    );
  };
}
