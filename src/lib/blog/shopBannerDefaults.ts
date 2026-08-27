export const SHOP_BANNER_WIDGET_SLUG = 'banner'

/** P18-C4-1: shop 主题首页 Banner 配置(Notion 系统 Widget slug=banner) */
export type ShopBannerConfig = {
  id?: string | null
  enabled: boolean
  /** 轮播图片 URL 列表;1 张=静态展示,>1 张自动轮播 */
  images: string[]
  /** 可选跳转链接(http(s) 或 / 开头) */
  link: string
  source?: 'notion' | 'default'
}

export function createDefaultShopBannerConfig(): ShopBannerConfig {
  return {
    id: null,
    enabled: false,
    images: [],
    link: '',
    source: 'default',
  }
}

/** Notion title 存储格式:多图逗号分隔(兼容换行/中文逗号) */
export function splitShopBannerImageList(raw: string | null | undefined): string[] {
  return String(raw || '')
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function joinShopBannerImageList(images: string[]): string {
  return images.join(',')
}

/** 跳转链接校验:http(s) 或站内 / 路径 */
export function normalizeShopBannerLink(value: string | null | undefined): string {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url
  return ''
}
