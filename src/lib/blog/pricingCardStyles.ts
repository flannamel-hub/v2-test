/**
 * 站点会员 R13:等级卡样式(会员说明页 /pricing)单点定义。
 * - copy.cardStyle 仅三值('ice'|'prism'|'modern'),缺省/非法=默认样式(不落库);
 * - 前台渲染(PricingPageContent)/读侧归一(membershipGate)/写侧 sanitize(pricing-copy API)/
 *   后台选择器(AdminDashboard)四处共用本模块,勿各自硬编码枚举。
 */
export type PricingCardStyleValue = 'ice' | 'prism' | 'modern'
export type PricingCardStyleResolved = 'default' | PricingCardStyleValue

/** 后台选择器选项(顺序即展示顺序;default=现有样式) */
export const PRICING_CARD_STYLE_OPTIONS: ReadonlyArray<{
  value: PricingCardStyleResolved
  label: string
}> = [
  { value: 'default', label: '默认' },
  { value: 'ice', label: '浅色冰晶' },
  { value: 'prism', label: '梦幻彩钻' },
  { value: 'modern', label: '简约现代' },
]

/** 归一:仅三值有效,其余(含 'default'/缺省/非法类型) → undefined(不落库/不生效) */
export function normalizePricingCardStyle(
  value: unknown
): PricingCardStyleValue | undefined {
  return value === 'ice' || value === 'prism' || value === 'modern'
    ? value
    : undefined
}

/** 渲染侧解析:非法/缺省 → 'default' */
export function resolvePricingCardStyle(
  value: unknown
): PricingCardStyleResolved {
  return normalizePricingCardStyle(value) ?? 'default'
}
