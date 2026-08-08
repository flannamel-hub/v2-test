import { BlogStats, Widget } from '@/src/types/blog'
import { formatAnnouncementPopupWidget } from './format/widget/announcementPopup'
import { formatGalleryAdWidget } from './format/widget/galleryAd'
import { formatPopupAdWidget } from './format/widget/popupAd'
import { formatProfileWidget } from './format/widget/profile'
import { formatSocialLinksWidget } from './format/widget/socialLinks'
import { formatStatsWidget } from './format/widget/stats'
import { formatVendingWidget } from './format/widget/vending'

export const supportedWidgetsMap: {
  [key: string]: {
    formatFn: (
      properties: Widget['properties'],
      blogStats: BlogStats,
      data?: any
    ) => any
    database: string[]
  }
} = {
  profile: {
    formatFn: formatProfileWidget,
    database: ['SocialLinks'],
  },
  'social-links': {
    formatFn: formatSocialLinksWidget,
    database: ['SocialLinks', 'Social Links', 'social-links', '社交媒体'],
  },
  stats: {
    formatFn: formatStatsWidget,
    database: [],
  },
  'gallery-ad': {
    formatFn: formatGalleryAdWidget,
    database: [],
  },
  vending: {
    formatFn: formatVendingWidget,
    database: [],
  },
  'announcement-popup': {
    formatFn: formatAnnouncementPopupWidget,
    database: [],
  },
  'popup-ad': {
    formatFn: formatPopupAdWidget,
    database: [],
  },
}
