import { getSupabaseAdmin } from '@/src/lib/supabase/admin'
import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'

/** BLOG 分层 P4:站点会员计划 / 配额状态读取(共用库 blog_quota_state)。
 * - 数据流:主站 plan 联动与每日 enforce cron 写入;BLOG 侧仅服务端只读。
 * - 模块级短缓存 30s(node runtime 模块作用域可靠;ISR 同实例内复用);
 * - 读取失败/未配置一律降级 free/normal/0(不阻塞页面,防误伤)。
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
}

export const DEFAULT_SITE_QUOTA_STATE: SiteQuotaState = {
  plan: 'free',
  readOnly: false,
  status: 'normal',
  pvPct: 0,
  bwPct: 0,
  galleryPct: 0,
}

const QUOTA_STATE_CACHE_MS = 30_000

let quotaStateMemo: { value: SiteQuotaState; at: number } | null = null
let quotaStateInflight: Promise<SiteQuotaState> | null = null

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
  }
}

/** 读取当前站点会员计划与用量百分比(30s 短缓存;失败降级 free) */
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

  quotaStateInflight = (async () => {
    let value = DEFAULT_SITE_QUOTA_STATE
    try {
      const { data, error } = await supabase
        .from('blog_quota_state')
        .select('plan, read_only, status, pv_pct, bw_pct, gallery_pct')
        .eq('site_id', siteId)
        .maybeSingle()
      if (!error && data) {
        value = normalizeRow(data as Record<string, unknown>)
      }
    } catch {
      // 静默降级:按 free/normal 处理,不阻塞页面渲染
    }
    quotaStateMemo = { value, at: Date.now() }
    return value
  })()

  try {
    return await quotaStateInflight
  } finally {
    quotaStateInflight = null
  }
}

/** 当前站点是否专业版(读取失败按免费版处理) */
export async function isProSite(): Promise<boolean> {
  const state = await getSiteQuotaState()
  return state.plan === 'pro'
}
