import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'
import { getSiteQuotaState } from '@/src/lib/blog/quotaState'

const TABLE = 'blog_site_settings'

// TTL 短缓存(15s),仅承载「成功读取」的规范化结果(enabled=false 的合法关闭态也缓存);
// 缓存过期后的读取失败/缺列/无行一律返回 null —— 不做 last-known-good
// (LKG 会把开启态带过 DB 抖动期之外,还可能把已关闭配置带过窗口,与 fail-closed 语义矛盾;
//  参照 galleryFeatureGate 评审结论)。
const DEFAULT_CACHE_TTL_MS = 15_000

export type SiteMembershipPlan = { days: number; price: number; sku: string }
export type SiteMembershipCopy = Record<string, string>
export type SiteMembershipConfig = {
  enabled: true
  plans: SiteMembershipPlan[]
  copy: SiteMembershipCopy | null
}

type MembershipCache = {
  value: SiteMembershipConfig | null
  expiresAt: number
}

/** 读取结果包装:cacheable=false(fail-closed 分支)不写缓存 */
type MembershipRawRead = {
  cacheable: boolean
  config: SiteMembershipConfig | null
}

let cache: MembershipCache | null = null
let inflight: Promise<MembershipRawRead> | null = null
let generation = 0

function normalizePlans(raw: unknown): SiteMembershipPlan[] {
  if (!Array.isArray(raw)) return []
  const plans: SiteMembershipPlan[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    if (
      typeof record.days !== 'number' ||
      !Number.isInteger(record.days) ||
      record.days < 1
    ) {
      continue
    }
    if (typeof record.sku !== 'string' || !record.sku.trim()) continue
    if (typeof record.price !== 'number' || !Number.isFinite(record.price)) {
      continue
    }
    plans.push({ days: record.days, price: record.price, sku: record.sku.trim() })
  }
  return plans
}

function normalizeCopy(raw: unknown): SiteMembershipCopy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: SiteMembershipCopy = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (trimmed) out[key] = trimmed
  }
  return out
}

async function fetchMembershipRaw(): Promise<MembershipRawRead> {
  const siteId = getBlogSiteIdOrNull()
  const supabase = getSupabaseAdmin()
  if (!siteId || !supabase) {
    return { cacheable: false, config: null }
  }

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('membership')
      .eq('site_id', siteId)
      .maybeSingle()

    if (error) {
      // 缺列(迁移 022 未执行,Postgres 42703)等读取错误:fail-closed,不缓存失败值
      console.warn(
        '[membershipGate] blog_site_settings 读取失败(按关闭处理;若列缺失请先执行迁移 022):',
        error.message
      )
      return { cacheable: false, config: null }
    }
    if (!data) {
      // 无行:fail-closed,不缓存
      return { cacheable: false, config: null }
    }

    const raw = (data as { membership?: unknown }).membership
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      // 列为空/非对象 = 未开通(合法关闭态,可缓存)
      return { cacheable: true, config: null }
    }
    const record = raw as Record<string, unknown>
    if (record.enabled !== true) {
      return { cacheable: true, config: null }
    }

    const config: SiteMembershipConfig = {
      enabled: true,
      plans: normalizePlans(record.plans),
      copy: normalizeCopy(record.copy),
    }
    return { cacheable: true, config }
  } catch (e) {
    console.warn(
      '[membershipGate] blog_site_settings 读取异常(按关闭处理):',
      e instanceof Error ? e.message : e
    )
    return { cacheable: false, config: null }
  }
}

/**
 * 站点会员原始配置读取(blog_site_settings.membership,迁移 022)。
 * fail-closed 硬语义:BLOG_SITE_ID / Supabase 未配置、读取失败、表或列缺失、
 * 无行、值非对象、enabled !== true → 一律 null。
 * plans 逐项校验(days 正整数 / sku 非空 / price 有限数字),非法项剔除,全非法 → []。
 * copy 非对象或含非 string 值 → null;合法值 trim 后保留非空。
 */
export async function getMembershipConfig(): Promise<SiteMembershipConfig | null> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) {
    return cache.value
  }
  if (inflight) {
    return (await inflight).config
  }

  const currentGeneration = generation
  inflight = fetchMembershipRaw()
  try {
    const result = await inflight
    // 已被失效(测试 reset)的旧请求不得回写缓存
    if (result.cacheable && generation === currentGeneration) {
      cache = {
        value: result.config,
        expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS,
      }
    }
    return result.config
  } finally {
    inflight = null
  }
}

/**
 * 生效判定(双门):站点会员计划为 pro 且原始配置可用才返回配置,否则 null。
 * 所有消费方(props 注入 / /member 页 / 会员三路由)统一用本函数,不得各自散判。
 */
export async function getEffectiveMembershipConfig(): Promise<SiteMembershipConfig | null> {
  const [quotaState, config] = await Promise.all([
    getSiteQuotaState(),
    getMembershipConfig(),
  ])
  return quotaState.plan === 'pro' ? config : null
}

/** 测试辅助:清空 TTL 缓存与 inflight */
export function __resetMembershipGateCacheForTest(): void {
  generation += 1
  cache = null
  inflight = null
}
