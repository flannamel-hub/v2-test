import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'
import { getSiteQuotaState } from '@/src/lib/blog/quotaState'
import { normalizePricingCardStyle, type PricingCardStyleValue } from './pricingCardStyles'

const TABLE = 'blog_site_settings'

// TTL 短缓存(15s),仅承载「成功读取」的规范化结果(enabled=false 的合法关闭态也缓存);
// 缓存过期后的读取失败/缺列/无行一律返回 null —— 不做 last-known-good
// (LKG 会把开启态带过 DB 抖动期之外,还可能把已关闭配置带过窗口,与 fail-closed 语义矛盾;
//  参照 galleryFeatureGate 评审结论)。
const DEFAULT_CACHE_TTL_MS = 15_000

export type SiteMembershipPlan = { days: number; price: number; sku: string }

/**
 * 站点会员文案(R2-B5a 结构化透传;与 B5B 后台写入口径一一对齐):
 * - intro ≤500 / benefits ≤8 条×≤120 / guarantee ≤300 / faq ≤8 组×(q≤80/a≤300);
 *   updatedAt 非串忽略;
 * - 读侧同口径宽松截断(双保险,写侧已归一);
 * - 逐字段校验、非法字段丢弃(置 undefined),仅根对象非法才整份 null。
 */
/** R6-6:FAQ 组(q/a 逐字文本;读写双保险≤8 组、q≤80、a≤300) */
export type SiteMembershipCopyFaqItem = { q: string; a: string }
export type SiteMembershipCopy = {
  intro?: string
  benefits?: string[]
  guarantee?: string
  faq?: SiteMembershipCopyFaqItem[]
  /** R13:等级卡样式('ice'|'prism'|'modern';缺省=默认样式) */
  cardStyle?: PricingCardStyleValue
  updatedAt?: string
}
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

/** copy 字段长度上限(与 B5B 写入口径一致;读侧宽松截断双保险) */
const COPY_INTRO_MAX = 500
const COPY_BENEFIT_MAX_ITEMS = 8
const COPY_BENEFIT_ITEM_MAX = 120
const COPY_GUARANTEE_MAX = 300
const COPY_UPDATED_AT_MAX = 40
/** R6-6:FAQ 上限(与组件级双保险常量一致;读侧宽松截断) */
const COPY_FAQ_MAX_ITEMS = 8
const COPY_FAQ_Q_MAX = 80
const COPY_FAQ_A_MAX = 300

function normalizeCopyText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, max)
}

function normalizeCopy(raw: unknown): SiteMembershipCopy | null {
  // R2-B5a(R3):重写为结构化逐字段归一——逐字段校验、非法字段丢弃,
  // 仅根对象非法才整份 null;全部字段无效 → null(组件侧回落默认文案)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const out: SiteMembershipCopy = {}
  const intro = normalizeCopyText(record.intro, COPY_INTRO_MAX)
  if (intro !== undefined) out.intro = intro
  if (Array.isArray(record.benefits)) {
    const benefits = record.benefits
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().slice(0, COPY_BENEFIT_ITEM_MAX))
      .filter((item) => item.length > 0)
      .slice(0, COPY_BENEFIT_MAX_ITEMS)
    if (benefits.length > 0) out.benefits = benefits
  }
  if (Array.isArray(record.faq)) {
    const faq = record.faq
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => ({
        q: typeof item.q === 'string' ? item.q.trim().slice(0, COPY_FAQ_Q_MAX) : '',
        a: typeof item.a === 'string' ? item.a.trim().slice(0, COPY_FAQ_A_MAX) : '',
      }))
      .filter((item) => item.q.length > 0 && item.a.length > 0)
      .slice(0, COPY_FAQ_MAX_ITEMS)
    if (faq.length > 0) out.faq = faq
  }
  const guarantee = normalizeCopyText(record.guarantee, COPY_GUARANTEE_MAX)
  if (guarantee !== undefined) out.guarantee = guarantee
  const cardStyle = normalizePricingCardStyle(record.cardStyle)
  if (cardStyle !== undefined) out.cardStyle = cardStyle
  const updatedAt = normalizeCopyText(record.updatedAt, COPY_UPDATED_AT_MAX)
  if (updatedAt !== undefined) out.updatedAt = updatedAt
  if (Object.keys(out).length === 0) return null
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
 * copy 结构化逐字段归一(R2-B5a R3):根对象非法 → null;字段级非法丢弃;
 * 长度/条数上限宽松截断(intro≤500 / benefits≤8×≤120 / guarantee≤300)。
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
