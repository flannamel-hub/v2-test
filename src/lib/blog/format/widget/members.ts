import { BlogStats, Widget } from '@/src/types/blog'

/**
 * 站点会员 B1:members 容器(会员入口承载位,S3 平台侧创建)的 widgets 管线占位格式化。
 * 不注册会使 widgets 管线对 slug=members 报 not supported(照 banner.ts 前车之鉴);
 * B1 阶段不消费容器任何数据,database:[] 直走占位 formatFn——零 Notion 调用、零管线崩溃面。
 */
export type MembersWidgetType = Record<string, never>

export function formatMembersWidget(
  _properties: Widget['properties'],
  _blogStats?: BlogStats
): MembersWidgetType {
  return {}
}
