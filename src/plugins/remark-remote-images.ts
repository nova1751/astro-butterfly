import type { Root, Image } from 'mdast';
import { visit } from 'unist-util-visit';
import { isOptimizableRemote, resolveRemoteImage } from '../lib/remote-image';

/**
 * Markdown images on the allowed image hosts are optimised by Astro (AVIF/WebP,
 * width/height, lazy). Astro fails the whole build if one of them can't be
 * fetched, so check them first:
 *  - reachable: point at the final URL (see remote-image.ts for why)
 *  - unreachable: keep the original URL but take the node out of Astro's
 *    hands. Astro only collects `image` nodes; an `unoptimizedImage` node with
 *    hName 'img' still becomes a real <img> element, so rehype-content gives it
 *    the lightbox link and alt-text caption like any other image. (A raw HTML
 *    string would be invisible to rehype plugins and lose both.)
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
        parent.children[index] = {
          type: 'unoptimizedImage',
          position: node.position,
          data: { hName: 'img', hProperties: { src: node.url, alt: node.alt ?? '', ...(node.title ? { title: node.title } : {}) } },
        };
      }),
    );
  };
}
