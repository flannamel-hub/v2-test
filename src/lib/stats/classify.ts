/**
 * 派工单 B(商户投资版统计):访客 UA / Referrer 分类。
 *
 * 口径权威:docs/STATS_CLASSIFY_REFERENCE.md(复制自主站 pro-merchant-v3
 * lib/stats/metrics.ts,单 A 2026-09-05 定稿)。集合与规则必须与该文件逐字一致,
 * 两端(主站 / BLOG 模板)不可各自漂移;若未来改口径:先改主站 metrics.ts,
 * 再同步参考文件与本实现,最后同步 flush RPC 校验集。
 *
 * 枚举(与单 A RPC flush_blog_visit_events 的校验集一致):
 * - ua_class ∈ 'desktop' | 'mobile' | 'tablet' | 'bot' | 'other'
 * - referrer_class ∈ 'engine' | 'social' | 'direct'
 */

/** UA 分类枚举(= VISIT_UA_CLASSES) */
export type VisitUaClass = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'other'

/** Referrer 分类枚举(= VISIT_REFERRER_CLASSES) */
export type VisitReferrerClass = 'engine' | 'social' | 'direct'

/**
 * Referrer 引擎 host 前缀(一级标签前缀匹配;覆盖国家域如 google.com.hk / yandex.ru)。
 * 照抄参考文件,勿改。
 */
const ENGINE_HOST_PREFIXES = ['google.', 'bing.', 'duckduckgo.', 'yandex.'] as const

/**
 * Referrer 社媒 host 前缀。照抄参考文件,勿改
 * (注意 x.com / t.co / qq.com / douyin 无尾点,其余带尾点,与主站一致)。
 */
const SOCIAL_HOST_PREFIXES = [
  'facebook.',
  'instagram.',
  'x.com',
  'twitter.',
  't.co',
  'telegram.',
  'qq.com',
  'weixin.',
  'wechat.',
  'weibo.',
  'zhihu.',
  'reddit.',
  'youtube.',
  'tiktok.',
  'douyin',
  'linkedin.',
  'pinterest.',
  'discord.',
] as const

/**
 * UA 分类(参考文件 classifyUserAgent 规则,逐条照抄):
 * 1. trim 后为空 → other
 * 2. /bot|crawler|spider|crawling|headless/i → bot
 * 3. /ipad|tablet/i → tablet
 * 4. /mobile|iphone|android/i → mobile
 * 5. 否则 → desktop
 */
export function classifyUA(ua: string | undefined | null): VisitUaClass {
  const value = String(ua ?? '').trim()
  if (!value) return 'other'
  if (/bot|crawler|spider|crawling|headless/i.test(value)) return 'bot'
  if (/ipad|tablet/i.test(value)) return 'tablet'
  if (/mobile|iphone|android/i.test(value)) return 'mobile'
  return 'desktop'
}

/** host 归一化 + 前缀匹配(参考文件 classifyReferrerHost 规则,照抄) */
function classifyReferrerHost(host: string | undefined | null): VisitReferrerClass {
  let normalized = String(host ?? '').trim().toLowerCase()
  if (!normalized) return 'direct'
  if (normalized.startsWith('www.')) {
    normalized = normalized.slice(4)
  }
  if (!normalized) return 'direct'
  if (ENGINE_HOST_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return 'engine'
  }
  if (SOCIAL_HOST_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return 'social'
  }
  // 其余(含友链等外链)→ direct
  return 'direct'
}

/**
 * Referrer 分类:接受完整 referrer URL 或空串。
 * 空串 / 无法解析 → direct;解析成功后按 host 归一化前缀匹配。
 */
export function classifyReferrer(
  ref: string | undefined | null
): VisitReferrerClass {
  const value = String(ref ?? '').trim()
  if (!value) return 'direct'
  try {
    return classifyReferrerHost(new URL(value).hostname)
  } catch {
    return 'direct'
  }
}
