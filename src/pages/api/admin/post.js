import { Client, isFullPage } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { readPinnedFromNotionProperties } from '@/src/lib/blog/pinnedPosts';
import { getFavouritePropertyKey, readFavouritedFromNotionProperties } from '@/src/lib/blog/favouritePosts';
import { syncSiteThemeFromAdmin, getSiteThemeCode } from '@/src/lib/blog/siteTheme';
import {
  assertThemeSwitchAllowed,
  ThemeSwitchQuotaError,
  recordThemeSwitchIfNeeded,
} from '@/src/lib/blog/themeSwitchQuota';
import { normalizeMediaUrl, readNotionCoverUrl, findNotionPropertyKey, readCoverFromPageProperties, readPageCoverUrl, DOWNLOAD_SIZE_PROPERTY_NAMES, DOWNLOAD_COUNT_PROPERTY_NAMES, ARTICLE_PASSWORD_PROPERTY_NAMES, LINKED_PRODUCT_SKU_PROPERTY_NAMES, readDownloadSizeFromPageProperties, readDownloadCountFromPageProperties, readArticlePasswordFromPageProperties, readLinkedProductSkuFromPageProperties } from '@/src/lib/notion/readProperty';
import { getImageHostConfig } from '@/src/lib/media/imageHostConfig';
import { enqueueRevalidatePaths } from '@/src/lib/blog/revalidateQueue';
import { collectPostRevalidatePaths } from '@/src/lib/blog/contentRevalidation';
import { slugify } from '@/src/lib/util';

const notion = new Client({
  auth: process.env.NOTION_KEY || process.env.NOTION_TOKEN,
});
const n2m = new NotionToMarkdown({ notionClient: notion });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 网络抖动(ECONNRESET 等)自动重试：本地到 api.notion.com 偶发连接重置时不至于整单失败
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
      await sleep(500 * Math.pow(2, i)); // 0.5s, 1s, 2s, 4s
    }
  }
  throw lastErr;
};

/** 读取 Notion rich_text 字段 */
function readRichTextProperty(prop) {
  if (!prop || prop.type !== 'rich_text') return '';
  return (prop.rich_text || []).map((t) => t.plain_text).join('');
}

/** 读取 Notion download 字段（支持 rich_text；兼容旧 url 类型） */
function readDownloadProperty(prop) {
  if (!prop) return '';
  if (prop.type === 'rich_text') {
    return (prop.rich_text || []).map((t) => t.plain_text).join('');
  }
  if (prop.type === 'url') {
    return prop.url || '';
  }
  return '';
}

/** 按数据库属性类型写入 rich_text */
function buildRichTextProperty(value, targetProp) {
  const text = typeof value === 'string' ? value.trim() : '';
  const propType = targetProp?.type || 'rich_text';
  if (propType === 'rich_text') {
    return { rich_text: text ? [{ text: { content: text } }] : [] };
  }
  return { rich_text: text ? [{ text: { content: text } }] : [] };
}

/** 按数据库属性类型写入 linked_product_sku（select 库用 select，其余按 rich_text） */
function buildLinkedProductSkuProperty(value, targetProp) {
  const text = typeof value === 'string' ? value.trim() : '';
  const propType = targetProp?.type;
  if (propType === 'select') {
    return text ? { select: { name: text } } : { select: null };
  }
  return { rich_text: text ? [{ text: { content: text } }] : [] };
}

/** 按数据库属性类型写入 download */
function buildDownloadProperty(value, targetProp) {
  const text = typeof value === 'string' ? value : '';
  const propType = targetProp?.type || 'rich_text';
  if (propType === 'rich_text') {
    return { rich_text: text ? [{ text: { content: text } }] : [] };
  }
  if (propType === 'url') {
    return text.startsWith('http') ? { url: text } : { url: null };
  }
  return { rich_text: text ? [{ text: { content: text } }] : [] };
}

// === 1. 解析器 (保留洗链、视频/图片、代码块逻辑) ===
function parseLinesToChildren(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('# ')) { blocks.push({ object: 'block', type: 'heading_1', heading_1: { rich_text: inlineToRichRuns(trimmed.replace('# ', ''), {}) } }); continue; }
    if (trimmed.startsWith('`') && trimmed.endsWith('`') && trimmed.length > 1) { blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: trimmed.slice(1, -1) }, annotations: { code: true, color: 'red' } }] } }); continue; }
    // 整行图片/视频/裸链接
    const wholeMd = trimmed.match(/^!?\[.*?\]\((.*?)\)$/);
    const bareUrl = !wholeMd && /^https?:\/\/[^\s"']+$/.test(trimmed) ? trimmed : null;
    const mediaCandidate = wholeMd ? wholeMd[1] : bareUrl;
    if (mediaCandidate) {
      const urlMatch = mediaCandidate.match(/https?:\/\/[^\s"']+/);
      if (urlMatch) {
        let safeUrl = normalizeLinkUrl(urlMatch[0]);
        const isVideo = safeUrl.match(/\.(mp4|mov|webm|ogg|mkv)(\?|$)/i);
        const isImage = safeUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i);
        const mediaUrl = isVideo || isImage ? (normalizeMediaUrl(safeUrl) || safeUrl) : safeUrl;
        if (isVideo) { blocks.push({ object: 'block', type: 'video', video: { type: 'external', external: { url: mediaUrl } } }); continue; }
        if (isImage) { blocks.push({ object: 'block', type: 'image', image: { type: 'external', external: { url: mediaUrl } } }); continue; }
        if (bareUrl) { blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: safeUrl, link: { url: safeUrl } } }] } }); continue; }
      }
    }
    blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: inlineToRichRuns(line, {}) } });
  }
  return blocks;
}

// === 2. 转换器 (保留加密块状态机) ===
function mdToBlocks(markdown) {
  if (!markdown) return [];
  const rawChunks = markdown.split(/\n{2,}/);
  const blocks = [];
  let mergedChunks = [];
  let buffer = "";
  let isLocking = false;
  for (let chunk of rawChunks) {
    const t = chunk.trim();
    if (!t) continue;
    if (!isLocking && t.startsWith(':::lock')) { if (t.endsWith(':::')) mergedChunks.push(t); else { isLocking = true; buffer = t; } } 
    else if (isLocking) { buffer += "\n\n" + t; if (t.endsWith(':::')) { isLocking = false; mergedChunks.push(buffer); buffer = ""; } } 
    else { mergedChunks.push(t); }
  }
  if (buffer) mergedChunks.push(buffer);
  for (let content of mergedChunks) {
    if (content.startsWith(':::lock')) {
        const firstLineEnd = content.indexOf('\n');
        const header = content.substring(0, firstLineEnd > -1 ? firstLineEnd : content.length);
        let pwd = header.replace(':::lock', '').replace(/[>*\s🔒]/g, '').trim(); 
        const body = content.replace(/^:::lock.*?\n/, '').replace(/\n:::$/, '').trim();
        blocks.push({ object: 'block', type: 'callout', callout: { rich_text: [{ text: { content: `LOCK:${pwd}` }, annotations: { bold: true } }], icon: { type: "emoji", emoji: "🔒" }, color: "gray_background", children: [ { object: 'block', type: 'divider', divider: {} }, ...parseLinesToChildren(body) ] } });
    } else { blocks.push(...parseLinesToChildren(content)); }
  }
  return blocks;
}

// === 3. 结构化编辑块 → Notion 块 (支持整块格式: 加粗/斜体/颜色) ===
const NOTION_COLORS = ['default','gray','brown','orange','yellow','green','blue','purple','pink','red'];

function annOf(b, extra = {}) {
  const color = NOTION_COLORS.includes(b && b.color) ? b.color : 'default';
  return { bold: !!(b && b.bold), italic: !!(b && b.italic), color, ...extra };
}

function normalizeLinkUrl(url) {
  let u = (url || '').trim();
  if (!u) return '';
  if (/[\[\]]/.test(u)) {
    try { u = encodeURI(decodeURI(u)); } catch (e) { u = encodeURI(u); }
  }
  return u;
}

/**
 * 把一段（单行）文本中的行内 Markdown 链接 `[文字](url)` 解析为多个 Notion rich_text run，
 * 其余普通文本保持为普通 run。所有 run 共享整块样式 annotations。
 */
function inlineToRichRuns(text, annotations) {
  const src = text == null ? '' : String(text);
  const ann = annotations || {};
  const runs = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    const idx = m.index;
    // 跳过图片语法 ![alt](url)：前面紧跟 ! 的当作普通文本处理
    if (idx > 0 && src[idx - 1] === '!') continue;
    if (idx > last) runs.push({ text: { content: src.slice(last, idx) }, annotations: ann });
    const label = m[1];
    const url = normalizeLinkUrl(m[2]);
    runs.push({
      text: url ? { content: label, link: { url } } : { content: label },
      annotations: ann,
    });
    last = idx + m[0].length;
  }
  if (last < src.length) runs.push({ text: { content: src.slice(last) }, annotations: ann });
  if (!runs.length) runs.push({ text: { content: src }, annotations: ann });
  return runs;
}

/** Notion rich_text 数组 → 行内 Markdown 字符串（带链接的 run 还原为 [文字](url)） */
function richToInlineMd(rts) {
  return (rts || [])
    .map((r) => {
      const t = r && r.plain_text != null ? r.plain_text : (r && r.text && r.text.content) || '';
      const url = (r && r.text && r.text.link && r.text.link.url) || (r && r.href) || '';
      return url ? `[${t}](${url})` : t;
    })
    .join('');
}

/** rich_text 数组里是否包含任意链接 run */
function richTextHasLink(rts) {
  return (rts || []).some((r) => (r && r.text && r.text.link && r.text.link.url) || (r && r.href));
}

// 文本(可多行)转 Notion 子块：整行图片/视频识别为独立块；其余按行内链接解析，并附加整块样式
function styledLinesToChildren(text, b) {
  const lines = (text || '').split(/\r?\n/);
  const out = [];
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // 整行就是一张图片/视频（[](url) / ![](url) / 裸 URL）→ 独立媒体块
    const wholeMd = trimmed.match(/^!?\[.*?\]\((.*?)\)$/);
    const bareUrl = !wholeMd && /^https?:\/\/[^\s"']+$/.test(trimmed) ? trimmed : null;
    const mediaCandidate = wholeMd ? wholeMd[1] : bareUrl;
    if (mediaCandidate) {
      const urlMatch = mediaCandidate.match(/https?:\/\/[^\s"']+/);
      if (urlMatch) {
        let safeUrl = normalizeLinkUrl(urlMatch[0]);
        const isVideo = safeUrl.match(/\.(mp4|mov|webm|ogg|mkv)(\?|$)/i);
        const isImage = safeUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i);
        const mediaUrl = isVideo || isImage ? (normalizeMediaUrl(safeUrl) || safeUrl) : safeUrl;
        if (isVideo) { out.push({ object: 'block', type: 'video', video: { type: 'external', external: { url: mediaUrl } } }); continue; }
        if (isImage) { out.push({ object: 'block', type: 'image', image: { type: 'external', external: { url: mediaUrl } } }); continue; }
        // 整行就是一个非图片链接（裸 URL）→ 链接段落
        if (bareUrl) {
          out.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: safeUrl, link: { url: safeUrl } }, annotations: annOf(b) }] } });
          continue;
        }
      }
    }
    // 行首列表前缀（仅 1. / - / [ ] / [x] 四种，前缀后须跟空白，避免误伤正文普通文本）→ 列表块
    const olPrefix = trimmed.match(/^1\.[ \t]+(.*)$/);
    if (olPrefix) { out.push({ object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: inlineToRichRuns(olPrefix[1], annOf(b)) } }); continue; }
    const ulPrefix = trimmed.match(/^-[ \t]+(.*)$/);
    if (ulPrefix) { out.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: inlineToRichRuns(ulPrefix[1], annOf(b)) } }); continue; }
    const todoPrefix = trimmed.match(/^\[([ xX])\][ \t]+(.*)$/);
    if (todoPrefix) { out.push({ object: 'block', type: 'to_do', to_do: { rich_text: inlineToRichRuns(todoPrefix[2], annOf(b)), checked: todoPrefix[1].toLowerCase() === 'x' } }); continue; }
    // 普通文本行（可能含行内 [文字](url)）
    out.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: inlineToRichRuns(line, annOf(b)) } });
  }
  return out;
}

function makeLockCallout(pwd, innerChildren) {
  const children = [{ object: 'block', type: 'divider', divider: {} }, ...innerChildren]
  return {
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: [{ text: { content: `LOCK:${pwd || ''}` }, annotations: { bold: true } }],
      icon: { type: 'emoji', emoji: '🔒' },
      color: 'gray_background',
      children,
    },
  }
}

/** 单个编辑器块 → Notion 子块（不含 callout 外壳） */
function editorBlockToNotionInner(b) {
  const type = b.type
  if (type === 'h1') {
    return [{ object: 'block', type: 'heading_1', heading_1: { rich_text: inlineToRichRuns(b.content || '', annOf(b)) } }]
  }
  if (type === 'note') {
    return [{
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          text: { content: b.content || '' },
          annotations: annOf(b, { code: true, color: (b.color && b.color !== 'default') ? b.color : 'red' }),
        }],
      },
    }]
  }
  if (type === 'quote') {
    return [{ object: 'block', type: 'quote', quote: { rich_text: inlineToRichRuns(b.content || '', annOf(b)) } }]
  }
  if (type === 'link') {
    const url = (b.url || '').trim()
    const text = b.content || url
    if (url) {
      return [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: text, link: { url } }, annotations: annOf(b) }] } }]
    }
    if (text) {
      return [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: text }, annotations: annOf(b) }] } }]
    }
    return []
  }
  if (type === 'image') {
    const url = (b.content || '').trim()
    if (!url) return []
    const mediaUrl = normalizeMediaUrl(url) || url
    const isVideo = url.match(/\.(mp4|mov|webm|ogg|mkv)(\?|$)/i)
    if (isVideo) return [{ object: 'block', type: 'video', video: { type: 'external', external: { url: mediaUrl } } }]
    return [{ object: 'block', type: 'image', image: { type: 'external', external: { url: mediaUrl } } }]
  }
  if (type === 'ol' || type === 'ul' || type === 'todo') {
    // 列表块：content 每行一个列表项（空行跳过）；todo 的 checked 按行取值，缺省 false；
    // todo 行首若有 [x] / [ ] 前缀约定，则去前缀并按前缀状态覆盖勾选
    const lines = String(b.content || '').split(/\r?\n/);
    const checkedArr = Array.isArray(b.checked) ? b.checked : [];
    const items = [];
    lines.forEach((line, i) => {
      let text = line.trim();
      if (!text) return;
      if (type === 'ol') {
        items.push({ object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: inlineToRichRuns(text, annOf(b)) } });
      } else if (type === 'ul') {
        items.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: inlineToRichRuns(text, annOf(b)) } });
      } else {
        let checked = !!checkedArr[i];
        const todoPrefix = text.match(/^\[([ xX])\][ \t]+(.*)$/);
        if (todoPrefix) {
          text = todoPrefix[2];
          checked = todoPrefix[1].toLowerCase() === 'x';
        }
        items.push({ object: 'block', type: 'to_do', to_do: { rich_text: inlineToRichRuns(text, annOf(b)), checked } });
      }
    });
    return items;
  }
  if (type === 'toggle') {
    // 折叠块（Phase5）：扁平模型，第 1 行为折叠标题，其余每行一个子段落
    const lines = Array.isArray(b.content)
      ? b.content.map((l) => String(l))
      : String(b.content || '').split(/\r?\n/);
    const title = lines.length ? lines[0] : '';
    const children = lines.slice(1).map((line) => ({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: inlineToRichRuns(line, annOf(b)) },
    }));
    // 整块判空：标题空白且所有子段落均为空白行时不导出（子行本身的空行语义在正常导出时保留）
    if (!title.trim() && children.every((c) => (c.paragraph.rich_text[0]?.text?.content || '').trim() === '')) return [];
    return [{
      object: 'block',
      type: 'toggle',
      toggle: { rich_text: inlineToRichRuns(title, annOf(b)), children },
    }];
  }
  if (type === 'lock') {
    const children = []
    children.push(...styledLinesToChildren(b.content || '', b))
    ;(b.images || []).forEach((url) => {
      const mediaUrl = normalizeMediaUrl(url) || url
      if (mediaUrl) children.push({ object: 'block', type: 'image', image: { type: 'external', external: { url: mediaUrl } } })
    })
    return children
  }
  return styledLinesToChildren(b.content || '', b)
}

function structuredToBlocks(blocks) {
  const out = []
  for (const b of (blocks || [])) {
    const inner = editorBlockToNotionInner(b)
    if (!inner.length) continue
    if (b.type === 'lock' || b.locked) {
      const pwd = b.type === 'lock' ? (b.pwd || b.lockPwd || '') : (b.lockPwd || b.pwd || '')
      out.push(makeLockCallout(pwd, inner))
    } else {
      out.push(...inner)
    }
  }
  return out
}

// === 4. Notion 块 → 结构化编辑块 (读取，保留整块格式) ===
const plainText = (rts) => (rts || []).map(x => x.plain_text).join('');
const annFrom = (rt) => ({
  bold: !!(rt && rt.annotations && rt.annotations.bold),
  italic: !!(rt && rt.annotations && rt.annotations.italic),
  color: (rt && rt.annotations && rt.annotations.color) || 'default',
});

function lockCalloutToEditorBlock(kids, pwd) {
  const contentKids = (kids || []).filter((k) => k.type !== 'divider')
  const images = []
  const textLines = []
  let lockAnn = null
  let headingBlock = null
  let quoteBlock = null
  let singleLink = null
  let singleNote = null

  for (const k of contentKids) {
    if (k.type === 'image') {
      const u = k.image?.external?.url || k.image?.file?.url
      if (u) images.push(u)
    } else if (k.type === 'video') {
      const u = k.video?.external?.url || k.video?.file?.url
      if (u) images.push(u)
    } else if (k.type === 'heading_1' || k.type === 'heading_2' || k.type === 'heading_3') {
      headingBlock = k
    } else if (k.type === 'quote') {
      quoteBlock = k
    } else if (k.type === 'paragraph') {
      const rts = k.paragraph.rich_text || []
      const p = richTextHasLink(rts) ? richToInlineMd(rts) : plainText(rts)
      if (!p) continue
      const rt = rts[0]
      const onlyRun = rts.length === 1 ? rts[0] : null
      const pureLink = onlyRun && ((onlyRun.text && onlyRun.text.link && onlyRun.text.link.url) || onlyRun.href)
      if (pureLink && contentKids.length === 1) {
        singleLink = {
          content: plainText(rts),
          url: pureLink,
          ...annFrom(rt),
        }
      } else if (rt && rt.annotations && rt.annotations.code && contentKids.length === 1) {
        singleNote = { content: plainText(rts), ...annFrom(rt) }
      } else {
        textLines.push(p)
        if (!lockAnn) lockAnn = annFrom(rt)
      }
    } else if (k.type === 'numbered_list_item' || k.type === 'bulleted_list_item' || k.type === 'to_do') {
      // 锁块内列表项：以带前缀文本行（1. / - / [ ] [x]）进 textLines，保存时 styledLinesToChildren 可还原为列表块
      const listRts = (k[k.type] && k[k.type].rich_text) || []
      const p = richTextHasLink(listRts) ? richToInlineMd(listRts) : plainText(listRts)
      if (!p) continue
      if (k.type === 'numbered_list_item') {
        textLines.push(`1. ${p}`)
      } else if (k.type === 'bulleted_list_item') {
        textLines.push(`- ${p}`)
      } else {
        textLines.push(`${k.to_do && k.to_do.checked ? '[x]' : '[ ]'} ${p}`)
      }
      if (!lockAnn) lockAnn = annFrom(listRts[0])
    }
  }

  // 专用加密块：文本 + 图片，或多张图片
  if (images.length > 1 || (images.length >= 1 && textLines.length >= 1)) {
    return { type: 'lock', pwd, content: textLines.join('\n'), images, ...(lockAnn || {}) }
  }

  if (headingBlock && !textLines.length && !images.length && !quoteBlock) {
    const ht = headingBlock.type
    const rts = headingBlock[ht].rich_text || []
    const content = richTextHasLink(rts) ? richToInlineMd(rts) : plainText(rts)
    return { type: 'h1', locked: true, lockPwd: pwd, content, ...annFrom(rts[0]) }
  }

  if (quoteBlock && !textLines.length && !images.length && !headingBlock) {
    const rts = quoteBlock.quote.rich_text || []
    const content = richTextHasLink(rts) ? richToInlineMd(rts) : plainText(rts)
    return { type: 'quote', locked: true, lockPwd: pwd, content, ...annFrom(rts[0]) }
  }

  if (images.length === 1 && !textLines.length && !headingBlock && !quoteBlock) {
    return { type: 'image', locked: true, lockPwd: pwd, content: images[0] }
  }

  if (singleLink) {
    return { type: 'link', locked: true, lockPwd: pwd, ...singleLink }
  }

  if (singleNote && !textLines.length) {
    return { type: 'note', locked: true, lockPwd: pwd, ...singleNote }
  }

  // 仅文本（含旧版「纯文字专用加密块」）→ 带 locked 的内容块，便于二次编辑
  if (textLines.length >= 1 && !images.length) {
    return { type: 'text', locked: true, lockPwd: pwd, content: textLines.join('\n'), ...(lockAnn || {}) }
  }

  // 兜底：仍还原为专用 lock 块，避免丢内容
  return { type: 'lock', pwd, content: textLines.join('\n'), images, ...(lockAnn || {}) }
}

async function notionToEditorBlocks(blocks) {
  const out = [];
  for (const blk of (blocks || [])) {
    const t = blk.type;
    if (t === 'heading_1' || t === 'heading_2' || t === 'heading_3') {
      const rts = blk[t].rich_text || [];
      const content = richTextHasLink(rts) ? richToInlineMd(rts) : plainText(rts);
      out.push({ type: 'h1', content, ...annFrom(rts[0]) });
    } else if (t === 'paragraph') {
      const rts = blk.paragraph.rich_text || [];
      const rt = rts[0];
      const onlyRun = rts.length === 1 ? rts[0] : null;
      const pureLink = onlyRun && ((onlyRun.text && onlyRun.text.link && onlyRun.text.link.url) || onlyRun.href);
      if (pureLink) {
        // 整段就是一个链接 → 保留为「链接块」(便于用专门的链接 UI 编辑)
        out.push({ type: 'link', content: plainText(rts), url: pureLink, ...annFrom(rt) });
      } else if (richTextHasLink(rts)) {
        // 段落内含行内链接 → 用行内 Markdown 承载，避免丢失
        out.push({ type: 'text', content: richToInlineMd(rts), ...annFrom(rt) });
      } else if (rt && rt.annotations && rt.annotations.code) {
        out.push({ type: 'note', content: plainText(rts), ...annFrom(rt) });
      } else {
        out.push({ type: 'text', content: plainText(rts), ...annFrom(rt) });
      }
    } else if (t === 'quote') {
      const rts = blk.quote.rich_text || [];
      const content = richTextHasLink(rts) ? richToInlineMd(rts) : plainText(rts);
      out.push({ type: 'quote', content, ...annFrom(rts[0]) });
    } else if (t === 'image') {
      const url = (blk.image && (blk.image.external?.url || blk.image.file?.url)) || '';
      if (url) out.push({ type: 'image', content: url });
    } else if (t === 'video') {
      const url = (blk.video && (blk.video.external?.url || blk.video.file?.url)) || '';
      if (url) out.push({ type: 'image', content: url });
    } else if (t === 'callout') {
      const rt = blk.callout.rich_text || [];
      const txt = plainText(rt);
      const lock = txt.match(/^LOCK:\s*(.*)$/);
      if (lock) {
        const pwd = lock[1].trim();
        let kids = [];
        try { const r = await withRetry(() => notion.blocks.children.list({ block_id: blk.id })); kids = r.results; } catch (e) {}
        out.push(lockCalloutToEditorBlock(kids, pwd));
      } else {
        out.push({ type: 'text', content: txt, ...annFrom(rt[0]) });
      }
    } else if (t === 'numbered_list_item' || t === 'bulleted_list_item' || t === 'to_do') {
      // 列表项：按类型收集为列表块候选（相邻同类型稍后合并），保留行内链接
      const rts = blk[t].rich_text || [];
      const content = richTextHasLink(rts) ? richToInlineMd(rts) : plainText(rts);
      if (content) {
        if (t === 'numbered_list_item') {
          out.push({ type: 'ol', content, checked: null, ...annFrom(rts[0]) });
        } else if (t === 'bulleted_list_item') {
          out.push({ type: 'ul', content, checked: null, ...annFrom(rts[0]) });
        } else {
          out.push({ type: 'todo', content, checked: [!!(blk.to_do && blk.to_do.checked)], ...annFrom(rts[0]) });
        }
      }
    } else if (t === 'toggle') {
      // 折叠块（Phase5）：标题行 = toggle.rich_text；子内容 = children 中 paragraph 逐行，其他子块降级取文本行
      const rts = blk.toggle.rich_text || [];
      const title = richTextHasLink(rts) ? richToInlineMd(rts) : plainText(rts);
      let kids = [];
      if (blk.has_children && blk.id) {
        try { const r = await withRetry(() => notion.blocks.children.list({ block_id: blk.id })); kids = r.results; } catch (e) {}
      }
      const lines = [title];
      for (const k of kids) {
        const kd = k[k.type];
        const krts = (kd && kd.rich_text) || [];
        const p = richTextHasLink(krts) ? richToInlineMd(krts) : plainText(krts);
        // paragraph 逐行保留（含空行）；其他子块类型降级取文本行（空文本跳过）
        if (k.type === 'paragraph' || p) {
          lines.push(p);
        } else {
          // 无文本但有媒体引用的子块（纯图片/视频/附件/embed 等）：以占位行保留，避免静默丢失
          // kd 已是该类型 payload（如 { caption, type:'external', external:{url} } 或 embed 的 { url, caption }）
          const mediaUrl =
            (kd && kd.external && kd.external.url) ||
            (kd && typeof kd.url === 'string' && kd.url) ||
            '';
          // Notion 上传的 file-hosted URL 约 24 小时过期，不要写进占位行（避免把过期链接永久写入正文）
          const isTemporary = !!(kd && kd.file);
          if (isTemporary || mediaUrl) {
            lines.push(!isTemporary && mediaUrl ? `[图片] ${mediaUrl}` : '[图片]');
          }
        }
      }
      out.push({ type: 'toggle', content: lines, ...annFrom(rts[0]) });
    } else if (t === 'code') {
      // 代码块降级为文本块：代码全文原样保留（含换行），语言信息丢弃
      const rts = (blk.code && blk.code.rich_text) || [];
      out.push({ type: 'text', content: plainText(rts), ...annFrom(rts[0]) });
    } else if (t === 'divider') {
      // 分割线跳过 (加密块内部的分隔已在 lock 处理)
    } else {
      const data = blk[t];
      const rts = (data && data.rich_text) || [];
      const content = richTextHasLink(rts) ? richToInlineMd(rts) : plainText(rts);
      if (content) out.push({ type: 'text', content, ...annFrom(rts[0]) });
    }
  }
  // 合并相邻、同样式的纯文本块，避免按行碎片化（不合并已加密块）；
  // 相邻同类型列表块（ol/ul/todo）合并为一个多行列表块，中间出现其他类型块即断开
  const merged = [];
  for (const b of out) {
    const last = merged[merged.length - 1];
    if (
      (b.type === 'ol' || b.type === 'ul' || b.type === 'todo') &&
      last &&
      last.type === b.type
    ) {
      last.content = last.content + '\n' + b.content;
      if (b.type === 'todo' && Array.isArray(last.checked) && Array.isArray(b.checked)) {
        last.checked.push(...b.checked);
      }
    } else if (
      b.type === 'text' &&
      last &&
      last.type === 'text' &&
      !b.locked &&
      !last.locked &&
      !!last.bold === !!b.bold &&
      !!last.italic === !!b.italic &&
      (last.color || 'default') === (b.color || 'default')
    ) {
      last.content = last.content + '\n' + b.content;
    } else {
      merged.push(b);
    }
  }
  return merged;
}

function getPinnedPropertyKey(targetProps) {
  if (targetProps.pinned?.type === 'checkbox') return 'pinned';
  if (targetProps.Pinned?.type === 'checkbox') return 'Pinned';
  return null;
}

async function unpinAllExcept(notion, databaseId, exceptId, pinKey) {
  let cursor;
  do {
    const response = await withRetry(() =>
      notion.databases.query({
        database_id: databaseId,
        filter: { property: pinKey, checkbox: { equals: true } },
        page_size: 100,
        start_cursor: cursor,
      })
    );
    for (const page of response.results) {
      if (page.id !== exceptId) {
        await withRetry(() =>
          notion.pages.update({
            page_id: page.id,
            properties: { [pinKey]: { checkbox: false } },
          })
        );
      }
    }
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
}

export default async function handler(req, res) {
  await getImageHostConfig();
  const { id: queryId } = req.query;
  const databaseId = process.env.NOTION_DATABASE_ID || process.env.NOTION_PAGE_ID;

  try {
    if (req.method === 'GET') {
      const page = await withRetry(() => notion.pages.retrieve({ page_id: queryId }));
      if (!isFullPage(page)) {
        return res.status(404).json({ success: false, error: '页面不存在或无权访问' });
      }
      let mdblocks = [];
      let cleanContent = '';
      try {
        mdblocks = await withRetry(() => n2m.pageToMarkdown(queryId));
        mdblocks.forEach(b => {
          if (b.type === 'callout' && b.parent && b.parent.includes('LOCK:')) {
            const pwdMatch = b.parent.match(/LOCK:(.*?)(\n|$)/);
            const pwd = pwdMatch ? pwdMatch[1].trim() : '';
            const parts = b.parent.split('---');
            let body = parts.length > 1 ? parts.slice(1).join('---') : parts[0].replace(/LOCK:.*\n?/, '');
            body = body.replace(/^>[ \t]*/gm, '').trim(); 
            b.parent = `:::lock ${pwd}\n\n${body}\n\n:::`; 
          }
        });
        cleanContent = n2m.toMarkdownString(mdblocks).parent.trim();
      } catch (mdErr) {
        console.warn('pageToMarkdown failed, fallback empty content:', mdErr);
        cleanContent = '';
      }
      const p = page.properties;
      let rawBlocks = [];
      try { const blocksRes = await withRetry(() => notion.blocks.children.list({ block_id: queryId })); rawBlocks = blocksRes.results; } catch (e) {}
      let editorBlocks = [];
      try { editorBlocks = await notionToEditorBlocks(rawBlocks); } catch (e) { editorBlocks = []; }
      const coverUrl =
        readCoverFromPageProperties(p) ||
        readNotionCoverUrl(p.cover) ||
        readPageCoverUrl(page.cover) ||
        '';
      return res.status(200).json({ success: true, post: { id: page.id, title: p.title?.title?.[0]?.plain_text || p.Page?.title?.[0]?.plain_text || '无标题', slug: p.slug?.rich_text?.[0]?.plain_text || '', excerpt: p.excerpt?.rich_text?.[0]?.plain_text || '', category: p.category?.select?.name || '', tags: (p.tags?.multi_select || []).map(t => t.name).join(','), status: p.status?.status?.name || p.status?.select?.name || 'Published', type: p.type?.select?.name || 'Post', date: p.date?.date?.start || '', cover: coverUrl, pinned: readPinnedFromNotionProperties(p), favourited: readFavouritedFromNotionProperties(p), download: readDownloadProperty(p.download), download_size: readDownloadSizeFromPageProperties(p), download_count: readDownloadCountFromPageProperties(p), article_password: readArticlePasswordFromPageProperties(p), linked_product_sku: readLinkedProductSkuFromPageProperties(p), content: cleanContent, rawBlocks: rawBlocks, editorBlocks: editorBlocks } });
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const pageId = queryId || body.id;
      const { pinned, favourited, type, category } = body;
      if (!pageId) {
        return res.status(400).json({ success: false, error: '缺少 id' });
      }

      if (category !== undefined) {
        const page = await withRetry(() => notion.pages.retrieve({ page_id: pageId }));
        const catKey =
          page.properties['category']?.type === 'select'
            ? 'category'
            : page.properties['Category']?.type === 'select'
              ? 'Category'
              : null;
        if (!catKey) {
          return res.status(400).json({ success: false, error: '分类字段暂不可用，请联系管理员补充字段配置。' });
        }
        const newCat = String(category).trim();
        await withRetry(() =>
          notion.pages.update({
            page_id: pageId,
            properties: { [catKey]: newCat ? { select: { name: newCat } } : { select: null } },
          })
        );
        // revalidate 入队（失败不阻断）
        try {
          const oldCat = page.properties[catKey]?.select?.name || '';
          const paths = await collectPostRevalidatePaths(String(page.properties['slug']?.rich_text?.[0]?.plain_text || ''), {
            categoryId: slugify(newCat) || null,
            previousCategoryId: slugify(oldCat) || null,
          });
          await enqueueRevalidatePaths(paths, { scope: 'card-category-edit', reason: 'card-category-edit' });
        } catch (rvErr) {
          console.warn('card category revalidate enqueue failed:', rvErr);
        }
        return res.status(200).json({ success: true, category: newCat });
      }

      if (type !== undefined) {
        const nextType = String(type).trim();
        if (!['Post', 'Piece'].includes(nextType)) {
          return res.status(400).json({ success: false, error: 'type 仅支持 Post 或 Piece' });
        }
        await withRetry(() =>
          notion.pages.update({
            page_id: pageId,
            properties: { type: { select: { name: nextType } } },
          })
        );
        return res.status(200).json({ success: true, type: nextType });
      }

      if (pinned !== undefined) {
        const page = await withRetry(() => notion.pages.retrieve({ page_id: pageId }));
        const pinKey = getPinnedPropertyKey(page.properties);
        if (!pinKey) {
          return res.status(400).json({
            success: false,
            error: '置顶功能暂不可用，请联系管理员。',
          });
        }
        if (pinned) {
          await unpinAllExcept(notion, databaseId, pageId, pinKey);
        }
        await withRetry(() =>
          notion.pages.update({
            page_id: pageId,
            properties: { [pinKey]: { checkbox: !!pinned } },
          })
        );
        return res.status(200).json({ success: true, pinned: !!pinned });
      }

      if (favourited !== undefined) {
        const page = await withRetry(() => notion.pages.retrieve({ page_id: pageId }));
        const favKey = getFavouritePropertyKey(page.properties);
        if (!favKey) {
          return res.status(400).json({
            success: false,
            error: '收藏功能暂不可用，请联系管理完善文章字段配置。',
          });
        }
        await withRetry(() =>
          notion.pages.update({
            page_id: pageId,
            properties: { [favKey]: { checkbox: !!favourited } },
          })
        );
        return res.status(200).json({ success: true, favourited: !!favourited });
      }

      return res.status(400).json({ success: false, error: '缺少 pinned、favourited、type 或 category' });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { id, title, content, slug, excerpt, category, tags, status, date, type, cover, download, download_size, download_count, article_password, linked_product_sku, blocksData } = body;
      const useStructured = Array.isArray(blocksData);

      // 1. 获取目标页面属性，用于动态判定类型
      // P11-C5: 无 id 但 slug 已存在时转 update（复用已建页），避免重试/连点重复建稿
      let targetPageId = id || null;
      if (!targetPageId && typeof slug === 'string' && slug.trim()) {
          const found = await withRetry(() => notion.databases.query({
              database_id: databaseId,
              filter: { property: 'slug', rich_text: { equals: slug.trim() } },
              page_size: 5,
          }));
          targetPageId = found.results?.[0]?.id || null;
      }
      let targetProps = {};
      if (targetPageId) {
          const page = await withRetry(() => notion.pages.retrieve({ page_id: targetPageId }));
          targetProps = page.properties;
      } else {
          const db = await withRetry(() => notion.databases.retrieve({ database_id: databaseId }));
          targetProps = db.properties;
      }

      // 2. 智能构建属性
      const props = {};
      
      // 标题兼容性
      const titleKey = targetProps['title'] ? 'title' : (targetProps['Page'] ? 'Page' : 'title');
      if (title !== undefined) props[titleKey] = { title: [{ text: { content: title || "无标题" } }] };
      
      if (slug !== undefined) props["slug"] = { rich_text: [{ text: { content: slug } }] };
      if (excerpt !== undefined) props["excerpt"] = { rich_text: [{ text: { content: excerpt || "" } }] };
      if (category !== undefined) props["category"] = category ? { select: { name: category } } : { select: null };
      if (tags !== undefined) props["tags"] = { multi_select: (tags || "").split(',').filter(t => t.trim()).map(t => ({ name: t.trim() })) };
      
      // 🔴 智能状态修复逻辑
      if (status !== undefined && status !== null) {
          const statusType = targetProps['status']?.type || 'select';
          if (statusType === 'status') {
             props["status"] = { status: { name: status } }; // 适配 Status 类型
          } else {
             props["status"] = { select: { name: status } }; // 适配 Select 类型
          }
      }
      
      if (type !== undefined) props["type"] = { select: { name: type } };
      if (date !== undefined) props["date"] = date ? { date: { start: date } } : null;
      if (cover !== undefined) {
          const normalizedCover = normalizeMediaUrl(
            typeof cover === 'string' ? cover : ''
          );
          props['cover'] = normalizedCover ? { url: normalizedCover } : { url: null };
      }
      if (download !== undefined) {
          props['download'] = buildDownloadProperty(download, targetProps['download']);
      }
      if (download_size !== undefined) {
          const sizeKey = findNotionPropertyKey(targetProps, DOWNLOAD_SIZE_PROPERTY_NAMES);
          if (sizeKey) {
              props[sizeKey] = buildRichTextProperty(download_size, targetProps[sizeKey]);
          }
      }
      if (download_count !== undefined) {
          const countKey = findNotionPropertyKey(targetProps, DOWNLOAD_COUNT_PROPERTY_NAMES);
          if (countKey) {
              props[countKey] = buildRichTextProperty(download_count, targetProps[countKey]);
          }
      }
      if (article_password !== undefined) {
          const pwdKey = findNotionPropertyKey(targetProps, ARTICLE_PASSWORD_PROPERTY_NAMES);
          if (pwdKey) {
              props[pwdKey] = buildRichTextProperty(article_password, targetProps[pwdKey]);
          }
      }
      if (linked_product_sku !== undefined) {
          let skuKey = findNotionPropertyKey(targetProps, LINKED_PRODUCT_SKU_PROPERTY_NAMES);
          // P18-C1: 库里尚无 linked_product_sku 列时自动补建（rich_text），避免选择商品后静默丢失
          if (!skuKey && String(linked_product_sku || '').trim()) {
              try {
                  await withRetry(() => notion.databases.update({
                      database_id: databaseId,
                      properties: { linked_product_sku: { rich_text: {} } },
                  }));
                  skuKey = 'linked_product_sku';
              } catch (dbErr) {
                  console.warn('create linked_product_sku property failed:', dbErr);
              }
          }
          if (skuKey) {
              props[skuKey] = buildLinkedProductSkuProperty(linked_product_sku, targetProps[skuKey]);
          }
      }

      if (targetPageId) {
        let previousThemeCode = null;
        if (slug === 'theme-config' && excerpt !== undefined) {
          previousThemeCode = await getSiteThemeCode();
          const nextThemeCode = String(excerpt).trim();
          try {
            await assertThemeSwitchAllowed(previousThemeCode, nextThemeCode);
          } catch (themeQuotaErr) {
            if (themeQuotaErr instanceof ThemeSwitchQuotaError) {
              return res.status(429).json({
                success: false,
                error: themeQuotaErr.message,
                code: themeQuotaErr.code,
                windowEndsAt: themeQuotaErr.windowEndsAt,
                remainingMs: themeQuotaErr.remainingMs,
              });
            }
            throw themeQuotaErr;
          }
        }

        await withRetry(() => notion.pages.update({ page_id: targetPageId, properties: props }));
        if (slug === 'theme-config' && excerpt !== undefined) {
          const nextThemeCode = String(excerpt).trim();
          try {
            await recordThemeSwitchIfNeeded(previousThemeCode, nextThemeCode);
            await syncSiteThemeFromAdmin(excerpt, targetPageId);
          } catch (themeSyncErr) {
            console.warn('theme-config Supabase 同步失败（Notion 已保存）', themeSyncErr);
          }
        }
        const shouldReplaceBody = useStructured || content !== undefined;
        if (shouldReplaceBody) {
            const children = await withRetry(() => notion.blocks.children.list({ block_id: targetPageId }));
            if (children.results.length > 0) {
                for (const blk of children.results) {
                  await withRetry(() => notion.blocks.delete({ block_id: blk.id }));
                }
            }
            const newBlocks = useStructured
              ? structuredToBlocks(blocksData)
              : (content && content.trim().length > 0 ? mdToBlocks(content) : []);
            for (let i = 0; i < newBlocks.length; i += 100) {
              await withRetry(() => notion.blocks.children.append({ block_id: targetPageId, children: newBlocks.slice(i, i + 100) }));
              if (i + 100 < newBlocks.length) await sleep(100); 
            }
        }
      } else {
        const newBlocks = useStructured ? structuredToBlocks(blocksData) : mdToBlocks(content || "");
        const page = await withRetry(() => notion.pages.create({ parent: { database_id: databaseId }, properties: props, children: newBlocks.slice(0, 100) }));
        return res.status(200).json({ success: true, id: page.id });
      }
      return res.status(200).json({ success: true, id: targetPageId });
    }

    if (req.method === 'DELETE') {
      await withRetry(() => notion.pages.update({ page_id: queryId, archived: true }));
      return res.status(200).json({ success: true });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
