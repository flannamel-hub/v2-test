import { isValidLskyFileKey } from '@/src/lib/admin/lskyServer'
import { getAll } from '@/src/lib/notion/getDatabase'
import { getAllBlocks } from '@/src/lib/notion/getBlocks'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'
import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'

/**
 * Phase6 图床孤立文件治理 —— 扫描核心逻辑
 *
 * 保守铁律：任何解析失败 / 无法确认的 URL 一律视为「被引用」（不删）。
 * 引用集来源：
 *   1. Notion 全库（含 Post/Page/Widget/Piece 全部 type）
 *      - 页面 cover / icon / 属性（url、files、rich_text、title）
 *      - 正文 blocks 递归（含 callout 加密块、toggle、column 等 children）
 *      - 正文中的 child_database（友链/社媒等子库）行属性（头像等 files/url）
 *      - rich_text 明文中的 URL（markdown 图片语法等，宁可不删）
 *   2. Supabase gallery_images（url + thumb_url，BLOG_SITE_ID 存在则按租户过滤）
 *   3. Supabase crawler_ingest_queue pending/processing 的 image_urls（待入库保护）
 */

const LSKY_LIST_PER_PAGE = 100
const LSKY_LIST_MAX_PAGES = 500
const PLAIN_TEXT_URL_RE = /https?:\/\/[^\s<>"')\]]+/gi
const MAX_CHILD_DATABASES = 10
const SUPABASE_PAGE_SIZE = 1000
const CRAWLER_QUEUE_LIMIT = 500

/** 提取 rich_text 明文中的 URL（含 markdown 图片语法残留） */
export function extractPlainTextUrls(text) {
  const s = String(text || '')
  if (!s || !/https?:\/\//i.test(s)) return []
  const matches = s.match(PLAIN_TEXT_URL_RE)
  return matches ? matches : []
}

/**
 * 把一个引用 URL / 兰空 pathname 归一化为比对键集合。
 * - http(s) URL → new URL().pathname（解析失败时原样 trim 保留，保守不匹配）
 * - 裸路径 → 补齐前导 /
 * - 同时收录 decodeURIComponent 后的变体（中文名等编码差异）
 */
export function buildPathKeys(value) {
  const out = new Set()
  const s = String(value || '').trim()
  if (!s) return out

  let primary = ''
  if (/^https?:\/\//i.test(s)) {
    try {
      primary = new URL(s).pathname
    } catch (_) {
      out.add(s)
      return out
    }
  } else {
    primary = s.startsWith('/') ? s : `/${s}`
  }
  if (!primary) return out

  out.add(primary)
  try {
    const decoded = decodeURIComponent(primary)
    if (decoded && decoded !== primary) out.add(decoded)
  } catch (_) {
    /* 非法编码序列：保留原始键即可 */
  }
  return out
}

/** 收集 rich_text 数组中的 href + 明文 URL */
export function collectRichTextUrls(items, out) {
  if (!Array.isArray(items)) return
  for (const item of items) {
    if (item && typeof item.href === 'string' && item.href) out.push(item.href)
    const plain = (item && item.plain_text) || ''
    if (plain) {
      for (const url of extractPlainTextUrls(plain)) out.push(url)
    }
  }
}

function pushFileLikeTarget(target, out) {
  if (!target || typeof target !== 'object') return
  if (target.external && typeof target.external.url === 'string') {
    out.push(target.external.url)
  }
  if (target.file && typeof target.file.url === 'string') {
    out.push(target.file.url)
  }
}

/** 收集单个页面对象（主库或子库行）的 cover / icon / 属性引用 */
export function collectPageObjectUrls(page, out) {
  if (!page || typeof page !== 'object') return
  pushFileLikeTarget(page.cover, out)
  pushFileLikeTarget(page.icon, out)

  const properties = page.properties
  if (!properties || typeof properties !== 'object') return
  for (const prop of Object.values(properties)) {
    if (!prop || typeof prop !== 'object' || !prop.type) continue
    if (prop.type === 'url' && typeof prop.url === 'string' && prop.url) {
      out.push(prop.url)
    } else if (prop.type === 'files' && Array.isArray(prop.files)) {
      for (const file of prop.files) pushFileLikeTarget(file, out)
    } else if (prop.type === 'rich_text') {
      collectRichTextUrls(prop.rich_text, out)
    } else if (prop.type === 'title') {
      collectRichTextUrls(prop.title, out)
    }
  }
}

/**
 * 递归收集 block 内的媒体 URL（image/video/file/pdf 的 external|file、
 * bookmark/embed 的 url、caption / rich_text、children 里的加密块与折叠块）。
 * 遇到 child_database 记录其 id 供后续扫描子库。
 */
export function collectBlockUrls(block, out, childDatabaseIds) {
  if (!block || typeof block !== 'object') return
  if (block.type === 'child_database' && block.id) {
    if (childDatabaseIds) childDatabaseIds.add(block.id)
    return
  }
  const payload = block[block.type]
  if (payload && typeof payload === 'object') {
    if (typeof payload.url === 'string' && payload.url) out.push(payload.url)
    pushFileLikeTarget(payload, out)
    collectRichTextUrls(payload.rich_text, out)
    collectRichTextUrls(payload.caption, out)
  }
  if (Array.isArray(block.children)) {
    for (const child of block.children) {
      collectBlockUrls(child, out, childDatabaseIds)
    }
  }
}

/** Notion 全库引用收集（含子数据库行属性） */
export async function collectNotionReferenceUrls() {
  const urls = []
  const childDatabaseIds = new Set()

  const pages = await getAll()
  for (const page of pages) {
    collectPageObjectUrls(page, urls)
    const blocks = await getAllBlocks(page.id)
    for (const block of blocks) collectBlockUrls(block, urls, childDatabaseIds)
  }

  const childDbIds = Array.from(childDatabaseIds).slice(0, MAX_CHILD_DATABASES)
  for (const dbId of childDbIds) {
    try {
      const rows = await getAll(undefined, dbId)
      for (const row of rows) collectPageObjectUrls(row, urls)
    } catch (error) {
      // 子库读取失败不能让整个扫描失败，但必须记录；缺失的引用会让对应文件
      // 更容易被判为孤立，因此这里选择跳过子库（其内容通常只是头像/链接）
      console.warn(
        '[lsky-scan] 子数据库读取失败，已跳过：',
        error instanceof Error ? error.message : error
      )
    }
  }

  return urls
}

/** Supabase 图库引用（url + thumb_url）；失败必须中断扫描（保守） */
export async function collectGalleryReferenceUrls() {
  const urls = []
  const sb = getSupabaseAdmin()
  if (!sb) return urls

  const siteId = getBlogSiteIdOrNull()
  for (let from = 0; from < 200000; from += SUPABASE_PAGE_SIZE) {
    let query = sb
      .from('gallery_images')
      .select('url, thumb_url')
      .range(from, from + SUPABASE_PAGE_SIZE - 1)
    if (siteId) query = query.eq('site_id', siteId)
    const { data, error } = await query
    if (error) throw new Error(`图库引用读取失败：${error.message || error}`)
    for (const row of data || []) {
      if (row && typeof row.url === 'string' && row.url) urls.push(row.url)
      if (row && typeof row.thumb_url === 'string' && row.thumb_url) {
        urls.push(row.thumb_url)
      }
    }
    if (!data || data.length < SUPABASE_PAGE_SIZE) break
  }
  return urls
}

/** 爬虫待入库队列引用（pending/processing）；失败仅降级告警 */
export async function collectCrawlerQueueReferenceUrls() {
  const urls = []
  const sb = getSupabaseAdmin()
  if (!sb) return urls
  const siteId = getBlogSiteIdOrNull()
  try {
    let query = sb
      .from('crawler_ingest_queue')
      .select('image_urls')
      .in('status', ['pending', 'processing'])
      .limit(CRAWLER_QUEUE_LIMIT)
    if (siteId) query = query.eq('site_id', siteId)
    const { data, error } = await query
    if (error) throw error
    for (const row of data || []) {
      const list = row && row.image_urls
      if (Array.isArray(list)) {
        for (const url of list) {
          if (typeof url === 'string' && url) urls.push(url)
        }
      }
    }
  } catch (error) {
    console.warn(
      '[lsky-scan] 待入库队列读取失败，已跳过：',
      error instanceof Error ? error.message : error
    )
  }
  return urls
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function isLskyThrottleResponse(status, message) {
  return (
    status === 429 ||
    /too many attempts|throttle|太多|频繁|稍后再试/i.test(String(message || ''))
  )
}

async function fetchLskyJsonWithRetry(url, authorization, options) {
  const retryMax = options && options.retryMax != null ? options.retryMax : 5
  const retryBaseMs =
    options && options.retryBaseMs != null ? options.retryBaseMs : 2500

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: authorization, Accept: 'application/json' },
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch (_) {
      json = null
    }
    if (res.ok && json && json.status !== false) return json

    const message =
      (json && json.message) || `存储服务返回异常（HTTP ${res.status}）`
    if (!isLskyThrottleResponse(res.status, message) || attempt >= retryMax) {
      throw new Error(message)
    }
    await sleep(retryBaseMs * Math.pow(2, attempt))
  }
}

/** 分页拉取兰空全量文件列表 */
export async function fetchAllLskyImages(base, authorization, options) {
  const images = []
  let page = 1
  let lastPage = 1
  const pageDelayMs =
    options && options.pageDelayMs != null ? options.pageDelayMs : 300

  do {
    const json = await fetchLskyJsonWithRetry(
      `${base.replace(/\/+$/, '')}/api/v1/images?page=${page}&per_page=${LSKY_LIST_PER_PAGE}`,
      authorization,
      options
    )

    const payload = (json && json.data) || {}
    const list = Array.isArray(payload.data) ? payload.data : []
    for (const item of list) {
      images.push({
        key: String((item && item.key) || ''),
        name: String((item && (item.origin_name || item.name)) || ''),
        size: Number((item && item.size) || 0) || 0,
        date: String((item && item.date) || ''),
        pathname: String((item && item.pathname) || ''),
        url: String((item && item.links && item.links.url) || ''),
      })
    }

    const total = Number(payload.total) || images.length
    lastPage =
      Number(payload.last_page) ||
      Math.max(1, Math.ceil(total / LSKY_LIST_PER_PAGE))
    if (!list.length) break
    page += 1
    if (page <= lastPage && page <= LSKY_LIST_MAX_PAGES && pageDelayMs > 0) {
      await sleep(pageDelayMs)
    }
  } while (page <= lastPage && page <= LSKY_LIST_MAX_PAGES)

  return images
}

/** 全量引用集构建（Notion + Supabase 图库 + 爬虫队列） */
export async function collectAllReferenceUrls() {
  const notionUrls = await collectNotionReferenceUrls()
  const galleryUrls = await collectGalleryReferenceUrls()
  const crawlerUrls = await collectCrawlerQueueReferenceUrls()
  return { notionUrls, galleryUrls, crawlerUrls }
}

/** 引用 URL 列表 → pathname 比对键集合 */
export function buildReferenceKeySet(urls) {
  const keys = new Set()
  for (const url of urls || []) {
    for (const key of buildPathKeys(url)) keys.add(key)
  }
  return keys
}

function lastPathSegment(key) {
  const s = String(key || '')
  const idx = s.lastIndexOf('/')
  return idx >= 0 ? s.slice(idx + 1) : s
}

/**
 * 引用索引：完整 pathname 键 + 末段文件名集合。
 * 兰空 links.url 可能带路由前缀（如 /disk_r/）而 pathname 字段没有，
 * 末段（哈希文件名）兜底可避免这种结构差异造成的误判（宁可不删）。
 */
export function buildReferenceIndex(urls) {
  const keys = new Set()
  const lastSegments = new Set()
  for (const url of urls || []) {
    for (const key of buildPathKeys(url)) {
      keys.add(key)
      const segment = lastPathSegment(key)
      if (segment) lastSegments.add(segment)
    }
  }
  return { keys, lastSegments }
}

/** 用公开 origin 拼 pathname，生成缩略图地址兜底 */
export function joinPublicAssetUrl(origin, pathname) {
  const base = String(origin || '').replace(/\/+$/, '')
  const path = String(pathname || '').replace(/^\/+/, '')
  if (!base || !path) return ''
  return `${base}/${path}`
}

/**
 * 孤立判定：pathname 与 links.url 两条来源全部不在引用索引中 → 孤立。
 * 保守策略：key 非法 / 无任何可识别 pathname 的文件一律不判孤立；
 * 末段文件名命中也视为被引用（结构差异兜底）。
 */
export function detectOrphanFiles(images, reference, publicAssetOrigin) {
  const refKeys =
    reference instanceof Set
      ? reference
      : (reference && reference.keys) || new Set()
  const refLastSegments =
    reference instanceof Set ? null : (reference && reference.lastSegments) || null

  const orphans = []
  for (const image of images || []) {
    if (!isValidLskyFileKey(image.key)) continue

    const candidates = new Set([
      ...buildPathKeys(image.pathname),
      ...buildPathKeys(image.url),
    ])
    if (!candidates.size) continue

    let referenced = false
    for (const key of candidates) {
      if (refKeys.has(key)) {
        referenced = true
        break
      }
      if (refLastSegments && refLastSegments.has(lastPathSegment(key))) {
        referenced = true
        break
      }
    }
    if (referenced) continue

    orphans.push({
      key: image.key,
      name: image.name,
      size: image.size,
      date: image.date,
      pathname: image.pathname,
      url: image.url || joinPublicAssetUrl(publicAssetOrigin, image.pathname),
    })
  }
  return orphans
}
