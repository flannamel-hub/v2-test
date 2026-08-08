import { BlogStats, Widget } from '@/src/types/blog'
import {
  PopupAdConfig,
  normalizePopupAdText,
} from '@/src/lib/blog/popupAdDefaults'

export function formatPopupAdWidget(
  properties: Widget['properties'],
  _blogStats?: BlogStats
): PopupAdConfig {
  return {
    enabled: true,
    title: normalizePopupAdText(properties.title, 120),
    content: normalizePopupAdText(properties.excerpt),
    image: properties.cover?.light?.src || '',
    buttonText: '',
    buttonUrl: '',
    source: 'notion',
  }
}
