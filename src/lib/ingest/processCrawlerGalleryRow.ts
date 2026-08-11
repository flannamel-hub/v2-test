import { Client, isFullPage } from '@notionhq/client'
import CONFIG from '@/blog.config'
import {
  generateUniquePostSlug,
  readSlugFromNotionPage,
} from '@/src/lib/blog/generateAdminPostSlug'
import { syncGalleryImages } from '@/src/lib/gallery/galleryDb'
import {
  findNotionPropertyKey,
  normalizeMediaUrl,
  COVER_PROPERTY_NAMES,
  DOWNLOAD_COUNT_PROPERTY_NAMES,
  DOWNLOAD_SIZE_PROPERTY_NAMES,
} from '@/src/lib/notion/readProperty'
import type { CrawlerQueueRow } from '@/src/lib/ingest/crawlerQueueDb'
import { getImageHostConfig } from '@/src/lib/media/imageHostConfig'
import { rewriteManagedAssetUrl } from '@/src/lib/media/rewriteManagedAssetUrl'

const notion = new Client({
  auth: process.env.NOTION_KEY || process.env.NOTION_TOKEN,
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isTransient = (e: unknown) => {
  const msg = String((e as Error)?.message || '')
  const code = String((e as { code?: string })?.code || '')
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket hang up|network|fetch failed|aborted/i.test(
    msg
  ) ||
    /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|ENOTFOUND/i.test(code) ||
    (e as { status?: number })?.status === 429 ||
    (e as { status?: number })?.status === 502 ||
    (e as { status?: number })?.status === 503 ||
    (e as { status?: number })?.status === 504
}

async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!isTransient(e) || i === retries - 1) throw e
      await sleep(500 * Math.pow(2, i))
    }
  }
  throw lastErr
}

function databaseId(): string {
  return process.env.NOTION_DATABASE_ID || process.env.NOTION_PAGE_ID || CONFIG.NOTION_PAGE_ID
}

function buildRichTextProperty(
  value: string,
  targetProp: { type?: string } | undefined
) {
  const text = typeof value === 'string' ? value.trim() : ''
  const propType = targetProp?.type || 'rich_text'
  if (propType === 'rich_text') {
    return { rich_text: text ? [{ text: { content: text } }] : [] }
  }
  return { rich_text: text ? [{ text: { content: text } }] : [] }
}

function buildDownloadProperty(
  value: string,
  targetProp: { type?: string } | undefined
) {
  const text = typeof value === 'string' ? value : ''
  const propType = targetProp?.type || 'rich_text'
  if (propType === 'rich_text') {
    return { rich_text: text ? [{ text: { content: text } }] : [] }
  }
  if (propType === 'url') {
    return text.startsWith('http') ? { url: text } : { url: null }
  }
  return { rich_text: text ? [{ text: { content: text } }] : [] }
}

function contentToNotionChildren(content: string): Array<Record<string, unknown>> {
  const text = (content || '').trim()
  if (!text) return []
  const lines = text.split(/\r?\n/)
  const blocks: Array<Record<string, unknown>> = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ text: { content: trimmed } }],
      },
    })
  }
  return blocks
}

type NotionPropsSchema = Record<string, { type?: string }>

async function loadTargetProps(pageId?: string | null): Promise<NotionPropsSchema> {
  if (pageId) {
    const page = await withRetry(() => notion.pages.retrieve({ page_id: pageId }))
    if (!isFullPage(page)) {
      throw new Error('文章页面数据不完整')
    }
    return page.properties as NotionPropsSchema
  }
  const db = await withRetry(() =>
    notion.databases.retrieve({ database_id: databaseId() })
  )
  return db.properties as NotionPropsSchema
}

function buildCoverProperty(
  coverUrl: string,
  targetProps: NotionPropsSchema
): Record<string, unknown> {
  const coverKey =
    findNotionPropertyKey(targetProps as never, COVER_PROPERTY_NAMES) || 'cover'
  const propSchema = targetProps[coverKey]
  const normalized = normalizeMediaUrl(coverUrl)
  if (!normalized) {
    if (propSchema?.type === 'files') {
      return { [coverKey]: { files: [] } }
    }
    return { [coverKey]: { url: null } }
  }
  if (propSchema?.type === 'files') {
    return {
      [coverKey]: {
        files: [
          {
            type: 'external',
            name: 'cover',
            external: { url: normalized },
          },
        ],
      },
    }
  }
  return { [coverKey]: { url: normalized } }
}

function buildNotionProperties(
  row: CrawlerQueueRow,
  postSlug: string,
  coverUrl: string,
  targetProps: NotionPropsSchema
): Record<string, unknown> {
  const status =
    process.env.CRAWLER_INGEST_DEFAULT_STATUS?.trim() || 'Published'
  const date = new Date().toISOString().split('T')[0]

  const titleKey = targetProps.title ? 'title' : targetProps.Page ? 'Page' : 'title'
  const props: Record<string, unknown> = {}

  props[titleKey] = {
    title: [{ text: { content: row.title.trim() || '无标题' } }],
  }
  props.slug = { rich_text: [{ text: { content: postSlug.trim() } }] }
  props.excerpt = {
    rich_text: [{ text: { content: (row.excerpt || '').trim() } }],
  }

  if (row.category?.trim()) {
    props.category = { select: { name: row.category.trim() } }
  } else {
    props.category = { select: null }
  }

  const tagNames = (row.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  props.tags = {
    multi_select: tagNames.map((name) => ({ name })),
  }

  const statusType = targetProps.status?.type || 'select'
  if (statusType === 'status') {
    props.status = { status: { name: status } }
  } else {
    props.status = { select: { name: status } }
  }

  props.type = { select: { name: 'Post' } }
  props.date = { date: { start: date } }

  Object.assign(props, buildCoverProperty(coverUrl, targetProps))

  props.download = buildDownloadProperty(row.download || '', targetProps.download)

  const sizeKey = findNotionPropertyKey(
    targetProps as never,
    DOWNLOAD_SIZE_PROPERTY_NAMES
  )
  if (sizeKey) {
    props[sizeKey] = buildRichTextProperty(
      row.download_size || '',
      targetProps[sizeKey]
    )
  }

  const countKey = findNotionPropertyKey(
    targetProps as never,
    DOWNLOAD_COUNT_PROPERTY_NAMES
  )
  if (countKey) {
    props[countKey] = buildRichTextProperty(
      row.download_count || '',
      targetProps[countKey]
    )
  }

  return props
}

async function replacePageBody(pageId: string, content: string) {
  const children = await withRetry(() =>
    notion.blocks.children.list({ block_id: pageId })
  )
  if (children.results.length > 0) {
    for (const blk of children.results) {
      await withRetry(() => notion.blocks.delete({ block_id: blk.id }))
    }
  }

  const newBlocks = contentToNotionChildren(content)
  if (newBlocks.length === 0) return

  for (let i = 0; i < newBlocks.length; i += 100) {
    await withRetry(() =>
      notion.blocks.children.append({
        block_id: pageId,
        children: newBlocks.slice(i, i + 100) as never,
      })
    )
    if (i + 100 < newBlocks.length) await sleep(100)
  }
}

export type ProcessCrawlerRowResult = {
  notionPageId: string
  slug: string
  imageCount: number
  action: 'created' | 'updated'
}

/**
 * 将队列行写入 Notion（Post）并同步 Gallery 图库。
 * 封面 = image_urls[0]；正文优先 content，否则 excerpt。
 * slug 由 BLOG 生成（p- 时间戳），不使用爬虫队列中的 slug 字段。
 */
export async function processCrawlerGalleryRow(
  row: CrawlerQueueRow,
  occupiedSlugs: Set<string>
): Promise<ProcessCrawlerRowResult> {
  const imageHostConfig = await getImageHostConfig()
  const imageUrls = row.image_urls
    .filter((u) => u.startsWith('http'))
    .map((url) => rewriteManagedAssetUrl(url, imageHostConfig))
  if (imageUrls.length === 0) {
    throw new Error('image_urls 至少需一张兰空图链')
  }

  const coverUrl = imageUrls[0]
  const bodyContent = (row.content || '').trim() || (row.excerpt || '').trim()

  const notionPageId = row.notion_page_id?.trim() || null
  let pageId = notionPageId
  let action: 'created' | 'updated' = 'updated'
  let postSlug: string

  if (pageId) {
    const page = await withRetry(() =>
      notion.pages.retrieve({ page_id: pageId! })
    )
    if (!isFullPage(page)) {
      throw new Error('文章页面不存在或数据不完整')
    }
    postSlug = readSlugFromNotionPage(page)
    if (!postSlug) {
      throw new Error('已有文章缺少 slug，请在后台编辑保存一次')
    }
    const targetProps = await loadTargetProps(pageId)
    const props = buildNotionProperties(row, postSlug, coverUrl, targetProps)
    await withRetry(() =>
      notion.pages.update({
        page_id: pageId!,
        properties: props as never,
      })
    )
    await replacePageBody(pageId!, bodyContent)
  } else {
    postSlug = generateUniquePostSlug(occupiedSlugs)
    occupiedSlugs.add(postSlug)
    const targetProps = await loadTargetProps(null)
    const props = buildNotionProperties(row, postSlug, coverUrl, targetProps)
    const children = contentToNotionChildren(bodyContent)
    const page = await withRetry(() =>
      notion.pages.create({
        parent: { database_id: databaseId() },
        properties: props as never,
        children: children.slice(0, 100) as never,
      })
    )
    pageId = page.id
    action = 'created'
  }

  const galleryResult = await syncGalleryImages({
    postSlug,
    postNotionId: pageId,
    title: row.title,
    images: imageUrls.map((url) => ({ url, thumb_url: url })),
  })

  return {
    notionPageId: pageId!,
    slug: postSlug,
    imageCount: galleryResult.imageCount,
    action,
  }
}
