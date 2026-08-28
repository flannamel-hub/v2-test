import { Page, Post, Title } from '@/src/types/blog'
import { TweetFeedMediaMap } from '@/src/lib/tweet/loadTweetFeedMedia'
import type { VendingConfig } from '@/src/lib/blog/vendingDefaults'
import type { ShopBannerConfig } from '@/src/lib/blog/shopBannerDefaults'

export type ThemeId = 'anzifan' | 'touchgal' | 'gallery' | 'tweet' | 'tweet-light' | 'tweet-dark' | 'shop' | 'shop-v2'

/**
 * 各主题首页组件共用 props。
 * posts 由 index 经 buildHomeFeedPosts 全量下发;构建与 ISR 策略见 blog.config.ts。
 */
export type ThemeHomeProps = {
  posts: Post[]
  widgets: { [key: string]: unknown }
  siteTitle?: Title
  navPages?: Page[]
  tweetFeedMedia?: TweetFeedMediaMap | null
  galleryFeedCovers?: Record<string, string> | null
  vendingConfig?: VendingConfig | null
  vendingEnabled?: boolean
  /** P18-C4-1: shop 主题首页 Banner(仅 shop 下发;其余主题为 null) */
  shopBanner?: ShopBannerConfig | null
}
