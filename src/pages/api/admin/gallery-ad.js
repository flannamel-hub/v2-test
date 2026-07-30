import { Client } from '@notionhq/client';

const notion = new Client({
  auth: process.env.NOTION_KEY || process.env.NOTION_TOKEN,
});

const MAIN_DB = process.env.NOTION_PAGE_ID || process.env.NOTION_DATABASE_ID;
const GALLERY_AD_SLUG = 'gallery-ad';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransient = (e) => {
  const msg = String((e && e.message) || '');
  const code = String((e && e.code) || '');
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket hang up|network|fetch failed|aborted/i.test(msg)
    || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|ENOTFOUND/i.test(code)
    || (e && (e.status === 429 || e.status === 502 || e.status === 503 || e.status === 504));
};

const withRetry = async (fn, retries = 4) => {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (!isTransient(e) || i === retries - 1) throw e;
      await sleep(500 * Math.pow(2, i));
    }
  }
  throw lastErr;
};

function readRichText(prop) {
  if (!prop || prop.type !== 'rich_text') return '';
  return (prop.rich_text || []).map((t) => t.plain_text).join('').trim();
}

function readCover(prop) {
  if (!prop || prop.type !== 'url') return '';
  return prop.url || '';
}

async function findGalleryAdWidget() {
  if (!MAIN_DB) throw new Error('文章数据服务尚未配置，请联系管理');

  let cursor;
  do {
    const q = await withRetry(() => notion.databases.query({ database_id: MAIN_DB, start_cursor: cursor }));
    for (const row of q.results) {
      const props = row.properties || {};
      const slug = readRichText(props.slug);
      const type = props.type?.select?.name || '';
      if (type === 'Widget' && slug === GALLERY_AD_SLUG) return row;
    }
    cursor = q.has_more ? q.next_cursor : undefined;
  } while (cursor);

  return null;
}

function mapAd(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    url: readRichText(props.excerpt),
    promoText: readRichText(props.title),
    cover: readCover(props.cover),
  };
}

async function buildProperties(dbProps, { url, promoText, cover }) {
  const titleKey = dbProps['title'] ? 'title' : (dbProps['Page'] ? 'Page' : 'title');
  const statusType = dbProps['status']?.type || 'select';
  const statusName = statusType === 'status'
    ? (dbProps['status']?.status?.options?.find((o) => o.name === 'Published')?.name || 'Published')
    : 'Published';

  const properties = {
    [titleKey]: { title: [{ text: { content: (promoText || '').trim() || '广告位' } }] },
    slug: { rich_text: [{ text: { content: GALLERY_AD_SLUG } }] },
    excerpt: { rich_text: [{ text: { content: (url || '').trim() } }] },
    type: { select: { name: 'Widget' } },
    cover: (typeof cover === 'string' && cover.startsWith('http'))
      ? { url: cover }
      : { url: null },
  };

  if (statusType === 'status') {
    properties.status = { status: { name: statusName } };
  } else {
    properties.status = { select: { name: statusName } };
  }

  return properties;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const page = await findGalleryAdWidget();
      if (!page) {
        return res.status(200).json({
          success: true,
          ad: { id: null, url: '', promoText: '', cover: '' },
        });
      }
      return res.status(200).json({ success: true, ad: mapAd(page) });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { id, url, promoText, cover } = body || {};
      const trimmedUrl = (url || '').trim();
      if (!trimmedUrl || !trimmedUrl.startsWith('http')) {
        return res.status(400).json({ success: false, error: '请填写有效的广告链接（需以 http 开头）' });
      }

      const db = await withRetry(() => notion.databases.retrieve({ database_id: MAIN_DB }));
      const properties = await buildProperties(db.properties || {}, {
        url: trimmedUrl,
        promoText: (promoText || '').trim(),
        cover: (cover || '').trim(),
      });

      if (id) {
        await withRetry(() => notion.pages.update({ page_id: id, properties }));
      } else {
        const existing = await findGalleryAdWidget();
        if (existing) {
          await withRetry(() => notion.pages.update({ page_id: existing.id, properties }));
        } else {
          await withRetry(() => notion.pages.create({
            parent: { database_id: MAIN_DB },
            properties,
          }));
        }
      }

      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const page = await findGalleryAdWidget();
      if (!page) return res.status(200).json({ success: true });
      await withRetry(() => notion.pages.update({ page_id: page.id, archived: true }));
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Gallery Ad API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
