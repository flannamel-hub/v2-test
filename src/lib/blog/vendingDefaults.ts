export const VENDING_WIDGET_SLUG = 'vending'
export const DEFAULT_VENDING_URL = 'https://store.pro-pl.us'
export const DEFAULT_VENDING_TITLE = '贩售机'

export type VendingConfig = {
  enabled: boolean
  url: string
  title: string
  id?: string | null
  source?: 'notion' | 'legacy' | 'default'
  /** VENDING_MODE2:custom=按钮原文显示；official/缺省=「前往」+名称 */
  mode?: 'official' | 'custom'
  /** VENDING_MODE2:购买说明弹窗；缺省 false=直接跳转 */
  noteModal?: boolean
}

export function normalizeVendingUrl(raw?: string | null): string {
  const value = (raw || '').trim()
  return value.startsWith('http') ? value : DEFAULT_VENDING_URL
}

export function normalizeVendingTitle(raw?: string | null): string {
  return (raw || '').trim() || DEFAULT_VENDING_TITLE
}
