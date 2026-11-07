import type { APIRoute } from 'astro';
import { getPosts, postUrl, tagUrl, excerpt } from '@/lib/posts';
import { site, feed } from '@/config';

/**
 * Atom ids are permanent identifiers, not links. If an earlier feed minted them under
 * another origin (a Hexo `url: http://…`), `feed.idOrigin` keeps them byte-identical so
 * readers don't re-announce every post after a move.
 */
const feedId = (url: string) => (feed.idOrigin ? url.replace(site.url, feed.idOrigin.replace(/\/$/, '')) : url);

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/** Atom feed at the Hexo-era address (/atom.xml), all posts, newest first. */
export const GET: APIRoute = async () => {
  const posts = await getPosts();
  const base = site.url;
  const updated = posts.reduce((d, p) => (p.data.updated > d ? p.data.updated : d), new Date(0));

  const entries = posts
    .map((p) => {
      const url = `${base}${postUrl(p)}`;
      return `  <entry>
    <title>${esc(p.data.title)}</title>
    <link href="${url}"/>
    <id>${feedId(url)}</id>
    <published>${p.data.date.toISOString()}</published>
    <updated>${p.data.updated.toISOString()}</updated>
    <summary type="text">${esc(excerpt(p, 200))}</summary>
${p.data.categories.map((c) => `    <category term="${esc(c)}" scheme="${base}/categories/"/>`).join('\n')}
${p.data.tags.map((t) => `    <category term="${esc(t)}" scheme="${base}${tagUrl(t)}"/>`).join('\n')}
  </entry>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(site.title)}</title>
  <subtitle>${esc(site.subtitle)}</subtitle>
  <icon>${site.logo}</icon>
  <link href="${base}/atom.xml" rel="self"/>
  <link href="${base}/"/>
  <updated>${updated.toISOString()}</updated>
  <id>${feedId(base)}/</id>
  <author><name>${esc(site.author)}</name></author>
  <generator uri="https://astro.build/">Astro</generator>
${entries}
</feed>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' } });
};
