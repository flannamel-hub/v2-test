import type { NextApiResponse } from 'next'
import {
  clearContentBuildCaches,
  collectPostRevalidatePaths,
  collectShellRevalidatePaths,
  revalidateMany,
  resolveRevalidateOrigin,
} from '@/src/lib/blog/contentRevalidation'
import { isGalleryTenantConfigured } from '@/src/lib/gallery/blogSite'
import { loadOccupiedPostSlugs } from '@/src/lib/blog/generateAdminPostSlug'
import {
  claimCrawlerQueueRows,
  failStaleProcessingRows,
  markCrawlerQueueRow,
  type CrawlerQueueRow,
} from '@/src/lib/ingest/crawlerQueueDb'
import { processCrawlerGalleryRow } from '@/src/lib/ingest/processCrawlerGalleryRow'
import { slugify } from '@/src/lib/util'

export type CrawlerIngestRunItem = {
  id: string
  source_id: string
  slug: string
  status: 'done' | 'failed' | 'skipped'
  action?: 'created' | 'updated'
  notionPageId?: string
  imageCount?: number
  error?: string
}

export type CrawlerIngestRunResult = {
  processed: number
  succeeded: number
  failed: number
  skipped: number
  staleFailed: number
  items: CrawlerIngestRunItem[]
}

const DEFAULT_MAX_DURATION_MS = 280_000

async function revalidatePost(
  res: NextApiResponse,
  row: CrawlerQueueRow,
  slug: string
) {
  const tagIds = (row.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((name) => slugify(name))

  const categoryId = row.category?.trim() ? slugify(row.category.trim()) : null

  const paths = await collectPostRevalidatePaths(slug, {
    categoryId,
    tagIds,
  })

  clearContentBuildCaches()
  await revalidateMany(res, paths, {
    clearCaches: false,
    contentChange: true,
    origin: resolveRevalidateOrigin(),
  })
}

async function processOneRow(
  row: CrawlerQueueRow,
  res: NextApiResponse,
  occupiedSlugs: Set<string>
): Promise<CrawlerIngestRunItem> {
  const base = {
    id: row.id,
    source_id: row.source_id,
    slug: row.slug,
  }

  await markCrawlerQueueRow(row.id, {
    status: 'processing',
    error_message: null,
  })

  try {
    const result = await processCrawlerGalleryRow(row, occupiedSlugs)

    await markCrawlerQueueRow(row.id, {
      status: 'done',
      notion_page_id: result.notionPageId,
      slug: result.slug,
      error_message: null,
      processed_at: new Date().toISOString(),
    })

    try {
      await revalidatePost(res, row, result.slug)
    } catch (revErr) {
      console.warn('爬虫入库后 ISR 刷新失败（文章已写入）', revErr)
    }

    return {
      ...base,
      slug: result.slug,
      status: 'done',
      action: result.action,
      notionPageId: result.notionPageId,
      imageCount: result.imageCount,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await markCrawlerQueueRow(row.id, {
      status: 'failed',
      error_message: message.slice(0, 2000),
      processed_at: new Date().toISOString(),
    })
    return { ...base, status: 'failed', error: message }
  }
}

export async function runCrawlerIngestJob(
  res: NextApiResponse,
  options?: {
    ids?: string[]
    /** 逐条处理直至无待入库或超时 */
    continuous?: boolean
    maxDurationMs?: number
    /** 批量逐条入库时由客户端在结束后统一刷新壳层 */
    deferShellRefresh?: boolean
  }
): Promise<CrawlerIngestRunResult> {
  if (!isGalleryTenantConfigured()) {
    throw new Error('爬虫入库服务尚未配置')
  }

  const staleFailed = await failStaleProcessingRows()
  const continuous = options?.continuous ?? false
  const maxDurationMs = options?.maxDurationMs ?? DEFAULT_MAX_DURATION_MS
  const start = Date.now()

  const occupiedSlugs = await loadOccupiedPostSlugs()
  const items: CrawlerIngestRunItem[] = []
  let succeeded = 0
  let failed = 0
  let skipped = 0

  const targetIds = options?.ids?.length
    ? [...new Set(options.ids.filter(Boolean))]
    : null
  let remainingIds = targetIds ? [...targetIds] : null

  while (true) {
    if (Date.now() - start > maxDurationMs) break

    await failStaleProcessingRows()

    let claimed: CrawlerQueueRow[] = []

    if (remainingIds) {
      if (remainingIds.length === 0) break
      const tryId = remainingIds[0]
      remainingIds = remainingIds.slice(1)
      claimed = await claimCrawlerQueueRows({ ids: [tryId], limit: 1 })
      if (!claimed.length) {
        if (continuous || targetIds) continue
        break
      }
    } else {
      claimed = await claimCrawlerQueueRows({ limit: 1 })
      if (!claimed.length) break
    }

    for (const row of claimed) {
      const item = await processOneRow(row, res, occupiedSlugs)
      items.push(item)
      if (item.status === 'done') succeeded += 1
      else if (item.status === 'failed') failed += 1
      else skipped += 1
    }

    if (!continuous && !targetIds) break
    if (targetIds && !continuous) break
  }

  if (succeeded > 0 && !options?.deferShellRefresh) {
    try {
      await revalidateShellAfterBatch(res)
    } catch (shellErr) {
      console.warn('爬虫入库后壳层列表刷新失败（文章已写入）', shellErr)
    }
  }

  return {
    processed: items.length,
    succeeded,
    failed,
    skipped,
    staleFailed,
    items,
  }
}

async function revalidateShellAfterBatch(res: NextApiResponse) {
  clearContentBuildCaches()
  const shellPaths = collectShellRevalidatePaths()
  await revalidateMany(res, shellPaths, {
    clearCaches: false,
    freshTheme: true,
    contentChange: true,
    origin: resolveRevalidateOrigin(),
  })
}
