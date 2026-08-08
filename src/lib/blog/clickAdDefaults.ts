export const CLICK_AD_WIDGET_SLUG = 'click-ad'

export type ClickAdConfig = {
  id?: string | null
  enabled: boolean
  /** 后台备注名（可选） */
  title: string
  /** 广告跳转链接（开启时必填） */
  url: string
  source?: 'notion' | 'default'
}

export function normalizeClickAdText(
  value: string | null | undefined,
  maxLength = 120
): string {
  return String(value || '').trim().slice(0, maxLength)
}

export function normalizeClickAdUrl(
  value: string | null | undefined
): string {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url
  return ''
}

export function createDefaultClickAdConfig(): ClickAdConfig {
  return {
    id: null,
    enabled: false,
    title: '',
    url: '',
    source: 'default',
  }
}

/** localStorage：同一访客每天只触发一次 */
export function getClickAdDayKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `click-ad:day:${y}-${m}-${d}`
}
