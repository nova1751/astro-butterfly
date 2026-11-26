import type { Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { EXIT, visit } from 'unist-util-visit';
import { countWords } from '../lib/wordcount';

/** Expose word count, reading minutes and math presence to `remarkPluginFrontmatter`. */
export default function remarkReading() {
  return (tree: Root, file: { data: { astro?: { frontmatter?: Record<string, unknown> } } }) => {
    const stats = countWords(toString(tree));
    const fm = (file.data.astro ??= {}).frontmatter ??= {};
    fm.wordcount = stats.words;
    fm.minutes = stats.minutes;
    let hasMath = false;
    visit(tree, (node) => {
      if (node.type === 'math' || node.type === 'inlineMath') {
        hasMath = true;
        return EXIT;
      }
    });
    fm.hasMath = hasMath;
  };
}
