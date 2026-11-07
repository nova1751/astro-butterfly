import { getCollection } from 'astro:content';
import { getPosts, postUrl, getTags, getCategories } from './posts';
import { site } from '@/config';

/** Indexable URLs (posts, pages, taxonomies) with last-modified dates. */
export async function sitemapEntries() {
  const posts = await getPosts();
  const pages = await getCollection('pages');
  const latest = posts[0]?.data.updated ?? new Date();
  const entries: { loc: string; lastmod: Date }[] = [
    { loc: '/', lastmod: latest },
    ...posts.map((p) => ({ loc: postUrl(p), lastmod: p.data.updated })),
    ...pages.map((p) => ({ loc: `/${p.id}/`, lastmod: p.data.date ?? latest })),
    { loc: '/archives/', lastmod: latest },
    { loc: '/tags/', lastmod: latest },
    { loc: '/categories/', lastmod: latest },
    ...(await getTags()).map((t) => ({ loc: t.url, lastmod: t.posts[0].data.updated })),
    ...(await getCategories()).map((c) => ({ loc: c.url, lastmod: c.posts[0].data.updated })),
  ];
  return entries.map((e) => ({ ...e, loc: encodeURI(`${site.url}${e.loc}`) }));
}
