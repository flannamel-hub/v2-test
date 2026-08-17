import { Client } from '@notionhq/client';
import { getSiteTitleQuota, recordSiteTitleChange } from '@/src/lib/blog/siteTitleQuota';

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

function joinNotionTitlePlain(titleItems) {
  const parts = (titleItems || []).map((t) => t.plain_text)
  const raw = parts.join('')
  if (/\s/.test(raw) || parts.length <= 1) return raw.trim()
  return parts.map((p) => p.trim()).filter(Boolean).join(' ')
}

export default async function handler(req, res) {
  const notion = new Client({ auth: process.env.NOTION_KEY || process.env.NOTION_TOKEN });
  const databaseId = process.env.NOTION_DATABASE_ID || process.env.NOTION_PAGE_ID;

  if (!databaseId) {
    return res.status(500).json({ success: false, error: '文章数据服务尚未配置，请联系管理' });
  }

  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const title = (body?.title || '').trim();
      if (!title) {
        return res.status(400).json({ success: false, error: '标题不能为空' });
      }

      const quota = await getSiteTitleQuota();
      if (!quota.canChange) {
        return res.status(429).json({
          success: false,
          error: '修改网站名称三日最多一次',
          retryAfterSec: quota.retryAfterSec,
        });
      }

      await withRetry(() =>
        notion.databases.update({
          database_id: databaseId,
          title: [{ type: 'text', text: { content: title } }],
        })
      );

      await recordSiteTitleChange();

      return res.status(200).json({ success: true, title });
    }

    const response = await withRetry(() =>
      notion.databases.retrieve({ database_id: databaseId })
    );
    const title = joinNotionTitlePlain(response.title) || 'PROBLOG';
    const siteTitleQuota = await getSiteTitleQuota();

    res.status(200).json({ success: true, siteInfo: { title }, siteTitleQuota });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
