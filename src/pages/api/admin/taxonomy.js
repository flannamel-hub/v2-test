import { Client } from '@notionhq/client';
import {
  deleteCategoryFromNotion,
  deleteTagFromNotion,
  renameCategoryFromNotion,
} from '@/src/lib/blog/deleteTaxonomy';

const PROTECTED_CATEGORIES = new Set(['网站信息', '系统组件', '站长通知', '未分类']);

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

export default async function handler(req, res) {
  const notion = new Client({ auth: process.env.NOTION_KEY || process.env.NOTION_TOKEN });
  const databaseId = process.env.NOTION_DATABASE_ID || process.env.NOTION_PAGE_ID;

  if (!databaseId) {
    return res.status(500).json({ success: false, error: '文章数据服务尚未配置，请联系管理' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (req.method === 'DELETE') {
      const type = (body?.type || '').trim();
      const name = (body?.name || '').trim();

      if (!name) {
        return res.status(400).json({ success: false, error: '缺少 name' });
      }

      if (type === 'category' && PROTECTED_CATEGORIES.has(name)) {
        return res.status(403).json({ success: false, error: '该分类为系统保留分类，不可删除' });
      }

      let result;
      if (type === 'category') {
        result = await withRetry(() => deleteCategoryFromNotion(notion, databaseId, name));
      } else if (type === 'tag') {
        result = await withRetry(() => deleteTagFromNotion(notion, databaseId, name));
      } else {
        return res.status(400).json({ success: false, error: 'type 须为 category 或 tag' });
      }

      return res.status(200).json({ success: true, ...result });
    }

    if (req.method === 'PATCH') {
      const type = (body?.type || '').trim();
      const oldName = (body?.oldName || '').trim();
      const newName = (body?.newName || '').trim();

      if (!oldName || !newName) {
        return res.status(400).json({ success: false, error: '缺少 oldName 或 newName' });
      }

      if (type === 'category') {
        if (PROTECTED_CATEGORIES.has(oldName)) {
          return res.status(403).json({ success: false, error: '该分类为系统保留分类，不可重命名' });
        }
        if (PROTECTED_CATEGORIES.has(newName)) {
          return res.status(403).json({ success: false, error: '不能使用系统保留分类名' });
        }
        const result = await withRetry(() =>
          renameCategoryFromNotion(notion, databaseId, oldName, newName)
        );
        return res.status(200).json({ success: true, ...result });
      }

      return res.status(400).json({ success: false, error: 'type 须为 category' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Taxonomy API error:', error);
    return res.status(500).json({ success: false, error: error.message || '操作失败' });
  }
}
