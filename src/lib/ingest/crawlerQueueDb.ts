import { getBlogSiteId, getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'

export type CrawlerQueueStatus =
  | 'pending'
  | 'processing'
  | 'done'
  | 'failed'
  | 'skipped'

/** 处理中超过此时长视为卡住，自动标记失败 */
export const CRAWLER_PROCESSING_STALE_MS = 5 * 60 * 1000

const STALE_FAIL_MESSAGE =
  '处理超时（超过 5 分钟无更新），已自动标记为失败，可重试入库'

export type CrawlerQueueRow = {
  id: string
  site_id: string
  source_id: string
  status: CrawlerQueueStatus
  title: string
  slug: string
  excerpt: string | null
  category: string | null
  tags: string | null
  download: string | null
  download_size: string | null
  download_count: string | null
  content: string | null
  image_urls: string[]
  notion_page_id: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  processed_at: string | null
}

function normalizeImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => u.startsWith('http'))
}

function mapRow(row: Record<string, unknown>): CrawlerQueueRow {
  return {
    id: String(row.id),
    site_id: String(row.site_id),
    source_id: String(row.source_id),
    status: row.status as CrawlerQueueStatus,
    title: String(row.title || ''),
    slug: String(row.slug || ''),
    excerpt: row.excerpt != null ? String(row.excerpt) : null,
    category: row.category != null ? String(row.category) : null,
    tags: row.tags != null ? String(row.tags) : null,
    download: row.download != null ? String(row.download) : null,
    download_size: row.download_size != null ? String(row.download_size) : null,
    download_count: row.download_count != null ? String(row.download_count) : null,
    content: row.content != null ? String(row.content) : null,
    image_urls: normalizeImageUrls(row.image_urls),
    notion_page_id:
      row.notion_page_id != null ? String(row.notion_page_id) : null,
    error_message: row.error_message != null ? String(row.error_message) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    processed_at: row.processed_at != null ? String(row.processed_at) : null,
  }
}

export async function listPendingCrawlerQueueRows(
  limit: number
): Promise<CrawlerQueueRow[]> {
  const sb = getSupabaseAdmin()
  const siteId = getBlogSiteIdOrNull()
  if (!sb || !siteId) return []

  const safeLimit = Math.min(Math.max(limit, 1), 50)
  const { data, error } = await sb
    .from('crawler_ingest_queue')
    .select('*')
    .eq('site_id', siteId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(safeLimit)

  if (error) throw error
  return (data || []).map((row) => mapRow(row as Record<string, unknown>))
}

/** 待入库全量列表（管理界面勾选，上限 500） */
export async function listAllPendingCrawlerQueueRows(
  limit = 500
): Promise<CrawlerQueueRow[]> {
  const sb = getSupabaseAdmin()
  const siteId = getBlogSiteIdOrNull()
  if (!sb || !siteId) return []

  const safeLimit = Math.min(Math.max(limit, 1), 500)
  const { data, error } = await sb
    .from('crawler_ingest_queue')
    .select('*')
    .eq('site_id', siteId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(safeLimit)

  if (error) throw error
  return (data || []).map((row) => mapRow(row as Record<string, unknown>))
}

export async function listProcessingCrawlerQueueRows(
  limit = 100
): Promise<CrawlerQueueRow[]> {
  const sb = getSupabaseAdmin()
  const siteId = getBlogSiteIdOrNull()
  if (!sb || !siteId) return []

  const safeLimit = Math.min(Math.max(limit, 1), 500)
  const { data, error } = await sb
    .from('crawler_ingest_queue')
    .select('*')
    .eq('site_id', siteId)
    .eq('status', 'processing')
    .order('updated_at', { ascending: true })
    .limit(safeLimit)

  if (error) throw error
  return (data || []).map((row) => mapRow(row as Record<string, unknown>))
}

export async function listFailedCrawlerQueueRows(
  limit = 200
): Promise<CrawlerQueueRow[]> {
  const sb = getSupabaseAdmin()
  const siteId = getBlogSiteIdOrNull()
  if (!sb || !siteId) return []

  const safeLimit = Math.min(Math.max(limit, 1), 500)
  const { data, error } = await sb
    .from('crawler_ingest_queue')
    .select('*')
    .eq('site_id', siteId)
    .eq('status', 'failed')
    .order('updated_at', { ascending: false })
    .limit(safeLimit)

  if (error) throw error
  return (data || []).map((row) => mapRow(row as Record<string, unknown>))
}

/**
 * 将卡在 processing 超过 maxAgeMs 的行标记为 failed
 */
export async function failStaleProcessingRows(
  maxAgeMs = CRAWLER_PROCESSING_STALE_MS
): Promise<number> {
  const sb = getSupabaseAdmin()
  const siteId = getBlogSiteIdOrNull()
  if (!sb || !siteId) return 0

  const cutoff = new Date(Date.now() - maxAgeMs).toISOString()
  const now = new Date().toISOString()
  const { data, error } = await sb
    .from('crawler_ingest_queue')
    .update({
      status: 'failed',
      error_message: STALE_FAIL_MESSAGE,
      processed_at: now,
      updated_at: now,
    })
    .eq('site_id', siteId)
    .eq('status', 'processing')
    .lt('updated_at', cutoff)
    .select('id')

  if (error) throw error
  return data?.length ?? 0
}

/**
 * 原子抢占待入库行（pending → processing），避免并发重复入库
 */
export async function claimCrawlerQueueRows(options?: {
  ids?: string[]
  limit?: number
}): Promise<CrawlerQueueRow[]> {
  const sb = getSupabaseAdmin()
  const siteId = getBlogSiteIdOrNull()
  if (!sb || !siteId) return []

  const maxClaim = Math.min(Math.max(options?.limit ?? 1, 1), 50)
  let candidateQuery = sb
    .from('crawler_ingest_queue')
    .select('id')
    .eq('site_id', siteId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (options?.ids?.length) {
    candidateQuery = candidateQuery.in(
      'id',
      options.ids.slice(0, maxClaim)
    )
  } else {
    candidateQuery = candidateQuery.limit(maxClaim)
  }

  const { data: candidates, error: selectError } = await candidateQuery
  if (selectError) throw selectError
  if (!candidates?.length) return []

  const ids = candidates.map((row) => String(row.id))
  const now = new Date().toISOString()
  const { data, error } = await sb
    .from('crawler_ingest_queue')
    .update({
      status: 'processing',
      error_message: null,
      updated_at: now,
    })
    .eq('site_id', siteId)
    .in('id', ids)
    .eq('status', 'pending')
    .select('*')

  if (error) throw error
  return (data || []).map((row) => mapRow(row as Record<string, unknown>))
}

export async function deleteCrawlerQueueRows(ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const sb = getSupabaseAdmin()
  if (!sb) throw new Error('入库服务尚未配置')
  const siteId = getBlogSiteId()

  const { error, count } = await sb
    .from('crawler_ingest_queue')
    .delete({ count: 'exact' })
    .eq('site_id', siteId)
    .in('id', ids)

  if (error) throw error
  return count ?? 0
}

export async function getCrawlerQueueSummary(): Promise<{
  pending: number
  processing: number
  done: number
  failed: number
  skipped: number
}> {
  const sb = getSupabaseAdmin()
  const siteId = getBlogSiteIdOrNull()
  if (!sb || !siteId) {
    return { pending: 0, processing: 0, done: 0, failed: 0, skipped: 0 }
  }

  const statuses: CrawlerQueueStatus[] = [
    'pending',
    'processing',
    'done',
    'failed',
    'skipped',
  ]
  const counts = { pending: 0, processing: 0, done: 0, failed: 0, skipped: 0 }

  for (const status of statuses) {
    const { count, error } = await sb
      .from('crawler_ingest_queue')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .eq('status', status)
    if (error) throw error
    counts[status] = count ?? 0
  }

  return counts
}

export async function listRecentCrawlerQueueRows(
  limit: number
): Promise<CrawlerQueueRow[]> {
  const sb = getSupabaseAdmin()
  const siteId = getBlogSiteIdOrNull()
  if (!sb || !siteId) return []

  const safeLimit = Math.min(Math.max(limit, 1), 100)
  const { data, error } = await sb
    .from('crawler_ingest_queue')
    .select('*')
    .eq('site_id', siteId)
    .order('updated_at', { ascending: false })
    .limit(safeLimit)

  if (error) throw error
  return (data || []).map((row) => mapRow(row as Record<string, unknown>))
}

export async function retryCrawlerQueueRow(id: string): Promise<void> {
  await markCrawlerQueueRow(id, {
    status: 'pending',
    error_message: null,
    processed_at: null,
  })
}

export async function retryCrawlerQueueRows(ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const sb = getSupabaseAdmin()
  if (!sb) throw new Error('入库服务尚未配置')
  const siteId = getBlogSiteId()
  const now = new Date().toISOString()

  const { data, error } = await sb
    .from('crawler_ingest_queue')
    .update({
      status: 'pending',
      error_message: null,
      processed_at: null,
      updated_at: now,
    })
    .eq('site_id', siteId)
    .in('id', ids)
    .in('status', ['failed', 'done', 'processing'])
    .select('id')

  if (error) throw error
  return data?.length ?? 0
}

export async function resetProcessingRowsToPending(ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const sb = getSupabaseAdmin()
  if (!sb) throw new Error('入库服务尚未配置')
  const siteId = getBlogSiteId()
  const now = new Date().toISOString()

  const { data, error } = await sb
    .from('crawler_ingest_queue')
    .update({
      status: 'pending',
      error_message: null,
      processed_at: null,
      updated_at: now,
    })
    .eq('site_id', siteId)
    .eq('status', 'processing')
    .in('id', ids)
    .select('id')

  if (error) throw error
  return data?.length ?? 0
}

export async function markCrawlerQueueRow(
  id: string,
  patch: Partial<{
    status: CrawlerQueueStatus
    slug: string
    notion_page_id: string | null
    error_message: string | null
    processed_at: string | null
  }>
): Promise<void> {
  const sb = getSupabaseAdmin()
  if (!sb) throw new Error('入库服务尚未配置')

  const siteId = getBlogSiteId()
  const { error } = await sb
    .from('crawler_ingest_queue')
    .update(patch)
    .eq('site_id', siteId)
    .eq('id', id)

  if (error) throw error
}
