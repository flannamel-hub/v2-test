import { BlogStats, Widget } from '@/src/types/blog'
import {
  ClickAdConfig,
  normalizeClickAdText,
  normalizeClickAdUrl,
} from '@/src/lib/blog/clickAdDefaults'

export function formatClickAdWidget(
  properties: Widget['properties'],
  _blogStats?: BlogStats
): ClickAdConfig {
  return {
    enabled: true,
    title: normalizeClickAdText(properties.title, 120),
    url: normalizeClickAdUrl(properties.excerpt),
    source: 'notion',
  }
}
