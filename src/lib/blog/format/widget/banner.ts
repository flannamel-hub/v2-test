import { BlogStats, Widget } from '@/src/types/blog'
import {
  ShopBannerConfig,
  normalizeShopBannerLink,
  splitShopBannerImageList,
} from '@/src/lib/blog/shopBannerDefaults'
import { normalizeMediaUrl } from '@/src/lib/notion/readProperty'

/**
 * P18-C4-1: widgets 管线的 banner 格式化(避免新增 slug=banner 后报 not supported)。
 * 前台 shop 首页实际读取走 shopBannerSettings.getShopBannerConfig(含 status 开关)。
 */
export function formatBannerWidget(
  properties: Widget['properties'],
  _blogStats?: BlogStats
): ShopBannerConfig {
  const images = splitShopBannerImageList(properties.title)
    .map((url) => normalizeMediaUrl(url) || '')
    .filter(Boolean)
  return {
    enabled: true,
    images,
    link: normalizeShopBannerLink(properties.excerpt),
    source: 'notion',
  }
}
