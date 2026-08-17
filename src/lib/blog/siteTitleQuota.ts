import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'

const TABLE = 'blog_site_settings'
/** 网站名称修改冷却：3 日内仅可修改一次，避免全站 revalidate 消耗 Vercel 配额 */
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000

/** 进程内兜底（无 Supabase 时尽力限制，不跨实例） */
const memoryLastChange = new Map<string, number>()

async function readLastChangeMs(siteId: string): Promise<number | null> {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('last_site_title_change_at')
      .eq('site_id', siteId)
      .maybeSingle()

    if (!error && data?.last_site_title_change_at) {
      const ms = new Date(data.last_site_title_change_at).getTime()
      if (!Number.isNaN(ms)) return ms
    }
  }

  const mem = memoryLastChange.get(siteId)
  return typeof mem === 'number' ? mem : null
}

async function writeLastChangeMs(siteId: string, atMs: number): Promise<void> {
  memoryLastChange.set(siteId, atMs)

  const supabase = getSupabaseAdmin()
  if (!supabase) return

  const at = new Date(atMs).toISOString()
  const { error: updateError } = await supabase
    .from(TABLE)
    .update({ last_site_title_change_at: at, updated_at: at })
    .eq('site_id', siteId)

  if (!updateError) return

  const { error: upsertError } = await supabase.from(TABLE).upsert(
    {
      site_id: siteId,
      theme_code: 'gallery',
      last_site_title_change_at: at,
      updated_at: at,
    },
    { onConflict: 'site_id' }
  )

  if (upsertError) {
    // 记录失败不影响主流程（改标题已成功），仅告警；冷却降级为不限制
    console.warn('[siteTitleQuota] record failed:', upsertError.message)
  }
}

export type SiteTitleQuota = {
  canChange: boolean
  retryAfterSec: number
}

export async function getSiteTitleQuota(): Promise<SiteTitleQuota> {
  const siteId = getBlogSiteIdOrNull()
  // 未配置 BLOG_SITE_ID 时降级不限制（单租户/本地开发场景）
  if (!siteId) return { canChange: true, retryAfterSec: 0 }

  const lastMs = await readLastChangeMs(siteId)
  if (!lastMs) return { canChange: true, retryAfterSec: 0 }

  const remaining = COOLDOWN_MS - (Date.now() - lastMs)
  if (remaining <= 0) return { canChange: true, retryAfterSec: 0 }

  return { canChange: false, retryAfterSec: Math.ceil(remaining / 1000) }
}

export async function assertSiteTitleChangeAllowed(): Promise<void> {
  const quota = await getSiteTitleQuota()
  if (!quota.canChange) {
    throw new Error('修改网站名称三日最多一次')
  }
}

export async function recordSiteTitleChange(): Promise<void> {
  const siteId = getBlogSiteIdOrNull()
  if (!siteId) return
  await writeLastChangeMs(siteId, Date.now())
}
