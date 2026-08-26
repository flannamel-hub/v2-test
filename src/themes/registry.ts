import { TouchgalLayout } from '@/src/components/section/TouchgalLayout'
import { ComponentType } from 'react'
import { DefaultHome } from './anzifan/DefaultHome'
import { GalleryHome } from './gallery/GalleryHome'
import { ShopHome } from './shop/ShopHome'
import { TweetHome } from './tweet/TweetHome'
import { ThemeHomeProps, ThemeId } from './types'

export const THEME_HOME: Record<ThemeId, ComponentType<ThemeHomeProps>> = {
  anzifan: DefaultHome,
  touchgal: TouchgalLayout as ComponentType<ThemeHomeProps>,
  gallery: GalleryHome,
  tweet: TweetHome,
  'tweet-light': TweetHome,
  'tweet-dark': TweetHome,
  shop: ShopHome,
}

/**
 * 新主题首页应使用 index 下发的 props.posts（buildHomeFeedPosts 全量），
 * 勿在主题内重复 getPosts。
 */

/** 将 theme-config.excerpt 或内部主题 ID 解析为 ThemeId */
export function resolveThemeId(code: string | null | undefined): ThemeId {
  const c = (code || '').trim().toLowerCase()
  if (c === 'v2' || c === 'touchgal') return 'touchgal'
  if (c === 'gallery') return 'gallery'
  if (c === 'tweet-light' || c === 'tweet_light') return 'tweet-light'
  if (c === 'tweet-dark' || c === 'tweet_dark') return 'tweet-dark'
  if (
    c === 'tweet' ||
    c === 'morethan-log' ||
    c === 'morethanlog' ||
    c === 'v3'
  ) {
    return 'tweet'
  }
  if (c === 'v1' || c === 'anzifan' || c === 'standard') return 'anzifan'
  if (c === 'shop' || c === 'mall') return 'shop'
  return 'anzifan'
}

export function getThemeHomeComponent(themeId: ThemeId) {
  return THEME_HOME[themeId] ?? DefaultHome
}
