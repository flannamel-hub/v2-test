import { getSupabaseAdmin } from '@/src/lib/supabase/admin'
import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'

/** BLOG 分层 P4:站点会员计划 / 配额状态读取(共用库 blog_quota_state)。
 * - 数据流:主站 plan 联动与每日 enforce cron 写入;BLOG 侧仅服务端只读。
 * - 模块级短缓存 30s(node runtime 模块作用域可靠;ISR 同实例内复用);
 * - 读取失败时优先沿用上次成功值(last-known-good,防共享库抖动把 pro 站误降级);
 * - 首次读取即失败(无历史值)才降级 free/normal/0(不阻塞页面,防误伤)。
 * 禁止在前端组件直接调用;不在浏览器缓存任何密钥。 */

export type SiteQuotaPlan = 'free' | 'pro'
export type SiteQuotaStatus = 'normal' | 'warning' | 'read_only' | 'paused'

export type SiteQuotaState = {
  plan: SiteQuotaPlan
  readOnly: boolean
  status: SiteQuotaStatus
  pvPct: number
  bwPct: number
  galleryPct: number
  /** P8:去除平台角标(仅专业版可开启;渲染需 brandClean && plan=pro) */
  brandClean: boolean
}

export const DEFAULT_SITE_QUOTA_STATE: SiteQuotaState = {
  plan: 'free',
  readOnly: false,
  status: 'normal',
  pvPct: 0,
  bwPct: 0,
  galleryPct: 0,
  brandClean: false,
}

const QUOTA_STATE_CACHE_MS = 30_000

let quotaStateMemo: { value: SiteQuotaState; at: number } | null = null
let quotaStateInflight: Promise<SiteQuotaState> | null = null
/** B5:last-known-good——最近一次成功读取的站点状态;读取失败时沿用,首次无值才降级默认 */
let quotaStateLastKnown: SiteQuotaState | null = null
let quotaStateGeneration = 0

function normalizePct(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(999, Math.round(n * 100) / 100)
}

function normalizeRow(row: Record<string, unknown>): SiteQuotaState {
  const status = String(row.status || '')
  return {
    plan: row.plan === 'pro' ? 'pro' : 'free',
    readOnly: row.read_only === true,
    status: (['normal', 'warning', 'read_only', 'paused'].includes(status)
      ? status
      : 'normal') as SiteQuotaStatus,
    pvPct: normalizePct(row.pv_pct),
    bwPct: normalizePct(row.bw_pct),
    galleryPct: normalizePct(row.gallery_pct),
    brandClean: row.brand_clean === true,
  }
}

/** 直读 blog_quota_state 单行(失败时优先沿用 last-known-good,首次失败才降级 free;不触碰缓存) */
async function fetchSiteQuotaStateRaw(
  siteId: string,
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>
): Promise<SiteQuotaState> {
  let value = DEFAULT_SITE_QUOTA_STATE
  let readFailed = false
  try {
    let { data, error } = await supabase
      .from('blog_quota_state')
      .select('plan, read_only, status, pv_pct, bw_pct, gallery_pct, brand_clean')
      .eq('site_id', siteId)
      .maybeSingle()
    // P8 兼容:共用库 017 未执行时降级为旧列读取(brand_clean 视为 false),
    // 避免 select 报错导致 pro 站点被整体降级为 free。
    if (error && /brand_clean/i.test(error.message || '')) {
      const legacy = await supabase
        .from('blog_quota_state')
        .select('plan, read_only, status, pv_pct, bw_pct, gallery_pct')
        .eq('site_id', siteId)
        .maybeSingle()
      data = legacy.data
      error = legacy.error
    }
    if (!error && data) {
      value = normalizeRow(data as Record<string, unknown>)
      quotaStateLastKnown = value
    } else if (error) {
      readFailed = true
    }
  } catch {
    readFailed = true
  }
  // B5:读取失败但有上次成功值时沿用(不降级 free/normal);首次无值才维持默认降级。
  if (readFailed && quotaStateLastKnown) {
    value = quotaStateLastKnown
  }
  return value
}

/** 读取当前站点会员计划与用量百分比(30s 短缓存;失败沿用 last-known-good,首次失败降级 free) */
export async function getSiteQuotaState(): Promise<SiteQuotaState> {
  const siteId = getBlogSiteIdOrNull()
  const supabase = getSupabaseAdmin()
  if (!siteId || !supabase) {
    return DEFAULT_SITE_QUOTA_STATE
  }

  const now = Date.now()
  if (quotaStateMemo && now - quotaStateMemo.at < QUOTA_STATE_CACHE_MS) {
    return quotaStateMemo.value
  }
  if (quotaStateInflight) {
    return quotaStateInflight
  }

  const generation = quotaStateGeneration
  quotaStateInflight = (async () => {
    const value = await fetchSiteQuotaStateRaw(siteId, supabase)
    // 缓存已被失效(invalidate)的旧请求不得回写 memo
    if (quotaStateGeneration === generation) {
      quotaStateMemo = { value, at: Date.now() }
    }
    return value
  })()

  try {
    return await quotaStateInflight
  } finally {
    quotaStateInflight = null
  }
}

/** P10-B2:跳过 30s 短缓存直读库,并刷新缓存(后台保存后回读最新状态) */
export async function getSiteQuotaStateDirect(): Promise<SiteQuotaState> {
  const siteId = getBlogSiteIdOrNull()
  const supabase = getSupabaseAdmin()
  if (!siteId || !supabase) {
    return DEFAULT_SITE_QUOTA_STATE
  }
  const value = await fetchSiteQuotaStateRaw(siteId, supabase)
  quotaStateMemo = { value, at: Date.now() }
  return value
}

/** P10-B2:使 30s 短缓存失效(本站写库成功后调用,防止读回旧值) */
export function invalidateSiteQuotaState() {
  quotaStateGeneration += 1
  quotaStateMemo = null
  quotaStateInflight = null
}

/** 当前站点是否专业版(读取失败按免费版处理) */
export async function isProSite(): Promise<boolean> {
  const state = await getSiteQuotaState()
  return state.plan === 'pro'
}
