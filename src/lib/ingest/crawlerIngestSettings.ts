import { getBlogSiteId, getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'

const TABLE = 'blog_site_settings'

export type CrawlerIngestAutoSettings = {
  enabled: boolean
  hour: number
}

const DEFAULT_HOUR = 3

function clampHour(hour: number): number {
  if (!Number.isFinite(hour)) return DEFAULT_HOUR
  return Math.min(23, Math.max(0, Math.floor(hour)))
}

/** 当前北京时间小时（0-23） */
export function getBeijingHour(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date())
  const hourPart = parts.find((p) => p.type === 'hour')
  const h = hourPart ? parseInt(hourPart.value, 10) : 0
  return Number.isFinite(h) ? h : 0
}

export async function getCrawlerIngestAutoSettings(): Promise<
  CrawlerIngestAutoSettings & { configured: boolean }
> {
  const siteId = getBlogSiteIdOrNull()
  const supabase = getSupabaseAdmin()
  if (!siteId || !supabase) {
    return { configured: false, enabled: false, hour: DEFAULT_HOUR }
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('crawler_ingest_auto_enabled, crawler_ingest_auto_hour')
    .eq('site_id', siteId)
    .maybeSingle()

  if (error || !data) {
    return { configured: true, enabled: false, hour: DEFAULT_HOUR }
  }

  return {
    configured: true,
    enabled: Boolean(data.crawler_ingest_auto_enabled),
    hour: clampHour(Number(data.crawler_ingest_auto_hour)),
  }
}

export async function updateCrawlerIngestAutoSettings(
  patch: Partial<CrawlerIngestAutoSettings>
): Promise<CrawlerIngestAutoSettings> {
  const siteId = getBlogSiteId()
  const supabase = getSupabaseAdmin()
  if (!supabase) throw new Error('入库服务尚未配置')

  const current = await getCrawlerIngestAutoSettings()
  const next: CrawlerIngestAutoSettings = {
    enabled: patch.enabled ?? current.enabled,
    hour: clampHour(patch.hour ?? current.hour),
  }

  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from(TABLE)
    .update({
      crawler_ingest_auto_enabled: next.enabled,
      crawler_ingest_auto_hour: next.hour,
      updated_at: now,
    })
    .eq('site_id', siteId)

  if (updateError) {
    const { error: upsertError } = await supabase.from(TABLE).upsert(
      {
        site_id: siteId,
        theme_code: 'gallery',
        crawler_ingest_auto_enabled: next.enabled,
        crawler_ingest_auto_hour: next.hour,
        updated_at: now,
      },
      { onConflict: 'site_id' }
    )
    if (upsertError) throw new Error(upsertError.message)
  }

  return next
}

/** cron 每日调用（UTC 19:00 ≈ 北京时间 03:00）：启用且整点匹配时执行 */
export async function shouldRunScheduledCrawlerIngest(): Promise<boolean> {
  const settings = await getCrawlerIngestAutoSettings()
  if (!settings.configured || !settings.enabled) return false
  return getBeijingHour() === settings.hour
}
