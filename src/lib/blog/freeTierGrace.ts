/** BLOG 分层 P4:免费版广告位过渡期常量。
 * 过渡期内,免费版站点若已有存量广告配置(非默认值)仍照常渲染;
 * 过渡期结束后统一收回(进入专业版权益)。可在下一版收紧。 */
export const FREE_AD_GRACE_UNTIL = '2026-09-30T23:59:59+08:00'

const FREE_AD_GRACE_UNTIL_MS = Date.parse(FREE_AD_GRACE_UNTIL)

/** 当前是否仍处于免费版广告过渡期(解析失败按已结束处理) */
export function isFreeAdGraceActive(now: Date = new Date()): boolean {
  if (!Number.isFinite(FREE_AD_GRACE_UNTIL_MS)) return false
  return now.getTime() < FREE_AD_GRACE_UNTIL_MS
}
