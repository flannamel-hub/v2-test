import { Client } from '@notionhq/client';
import { readPinnedFromNotionProperties } from '@/src/lib/blog/pinnedPosts';
import { readFavouritedFromNotionProperties } from '@/src/lib/blog/favouritePosts';
import { readDownloadSizeFromPageProperties, readDownloadCountFromPageProperties, readCoverFromPageProperties, readPageCoverUrl } from '@/src/lib/notion/readProperty';
import { loadGalleryFeedCovers } from '@/src/lib/gallery/galleryFeedPreviews';
import { resolveAdminListCoverSrc } from '@/src/lib/admin/resolveAdminListCover';
import { isPostIndexedBySlug } from '@/src/lib/notion/getBlogData';
import { getImageHostConfig } from '@/src/lib/media/imageHostConfig';

export default async function handler(req, res) {
  await getImageHostConfig();
  const notion = new Client({ auth: process.env.NOTION_KEY || process.env.NOTION_TOKEN });
  const databaseId = process.env.NOTION_DATABASE_ID || process.env.NOTION_PAGE_ID;

  try {
    const syncSlug = Array.isArray(req.query.syncSlug) ? req.query.syncSlug[0] : req.query.syncSlug;
    const syncId = Array.isArray(req.query.syncId) ? req.query.syncId[0] : req.query.syncId;
    if (syncSlug) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      const indexed = await isPostIndexedBySlug(String(syncSlug), syncId ? String(syncId) : null);
      return res.status(200).json({ success: true, indexed });
    }

    let allResults = [];
    let hasMore = true;
    let cursor = undefined;

    // 🟢 核心修复：全量递归抓取逻辑
    while (hasMore) {
      const response = await notion.databases.query({
        database_id: databaseId,
        start_cursor: cursor,
        page_size: 100, // 每次抓取最大上限
        sorts: [{ property: 'date', direction: 'descending' }],
      });

      allResults.push(...response.results);
      hasMore = response.has_more;
      cursor = response.next_cursor;
      
      // 安全阀：如果数据量极其庞大（比如超过500条），Vercel 可能会超时。
      // 对于一般的博客管理，100-500条可以一次性加载。
    }

    const categories = new Set();
    const tags = new Set();

    const posts = allResults.map((page) => {
      const p = page.properties;
      
      const catName = p.category?.select?.name || p.Category?.select?.name || '';
      if (catName) categories.add(catName);
      
      const tagList = p.tags?.multi_select || p.Tags?.multi_select || [];
      const tagNames = tagList.map(t => t.name);
      tagNames.forEach(t => tags.add(t));

      const notionCover =
        readCoverFromPageProperties(p) ||
        readPageCoverUrl(page.cover) ||
        '';

      return {
        id: page.id,
        title: p.title?.title?.[0]?.plain_text || p.Page?.title?.[0]?.plain_text || '无标题',
        slug: p.slug?.rich_text?.[0]?.plain_text || p.Slug?.rich_text?.[0]?.plain_text || '',
        excerpt: p.excerpt?.rich_text?.[0]?.plain_text || p.Excerpt?.rich_text?.[0]?.plain_text || '',
        category: catName,
        tags: tagNames.join(','),
        status: p.status?.status?.name || p.status?.select?.name || 'Published',
        type: p.type?.select?.name || p.Type?.select?.name || 'Post',
        date: p.date?.date?.start || p.Date?.date?.start || '',
        notionCover,
        cover: '',
        pinned: readPinnedFromNotionProperties(p),
        favourited: readFavouritedFromNotionProperties(p),
        download: (p.download?.type === 'rich_text'
          ? (p.download.rich_text || []).map((t) => t.plain_text).join('')
          : p.download?.url) || '',
        download_size: readDownloadSizeFromPageProperties(p),
        download_count: readDownloadCountFromPageProperties(p),
      };
    });

    const listSlugs = posts
      .filter((post) => post.slug && post.type !== 'Page')
      .map((post) => post.slug);

    let galleryFeedCovers = {};
    if (listSlugs.length > 0) {
      try {
        galleryFeedCovers = await loadGalleryFeedCovers(listSlugs);
      } catch (galleryErr) {
        console.error('Admin posts galleryFeedCovers load failed:', galleryErr);
      }
    }

    for (const post of posts) {
      post.cover = resolveAdminListCoverSrc(
        post.notionCover,
        galleryFeedCovers[post.slug]
      );
      delete post.notionCover;
    }

    const pinnedFirst = [...posts].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return String(b.date).localeCompare(String(a.date));
    });

    res.status(200).json({ 
      success: true, 
      posts: pinnedFirst,
      options: {
        categories: Array.from(categories),
        tags: Array.from(tags)
      }
    });

  } catch (error) {
    console.error('Posts API Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
