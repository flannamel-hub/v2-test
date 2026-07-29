import { Post } from '@/src/types/blog'
import { ApiScope } from '@/src/types/notion'
import getBlogStats from './getBlogStats'
import { formatPosts, FORMAT_POST_LIST_OPTIONS } from './format/post'
import { formatWidgets, preFormatWidgets } from './format/widget'
import { ANNOUNCEMENT_SLUG } from './pinnedPosts'
import { getPosts, getWidgets } from '../notion/getBlogData'
import { readRichTextPlain } from '../notion/readProperty'
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'

function isAnnouncementPost(data: unknown): data is Post {
  if (!data || typeof data !== 'object') return false
  const p = data as Post
  return typeof p.slug === 'string' && typeof p.title === 'string'
}

/** 站长通知帖（slug=announcement），供 StatsWidget 魔改公告卡使用 */
export async function getAnnouncementPost(): Promise<Post | null> {
  const posts = await getPosts(ApiScope.Archive)
  const raw = posts.find(
    (p) => readRichTextPlain(p.properties['slug']) === ANNOUNCEMENT_SLUG
  )
  if (!raw) return null
  const [post] = await formatPosts([raw], FORMAT_POST_LIST_OPTIONS)
  return post ?? null
}

/**
 * 首页 / About 等页共用的 profile + 公告组件数据。
 * 公告必须使用 announcement 文章，与 index 注入逻辑一致（覆盖 Notion Widget 里的 stats 格式化结果）。
 */
export async function loadHomeWidgets(options?: {
  /** 若已从首页文章列表解析出公告帖，传入可避免重复请求 Notion */
  announcement?: Post | null
  widgetPages?: PageObjectResponse[]
}): Promise<Record<string, unknown>> {
  const blogStats = await getBlogStats()
  const rawWidgets = await getWidgets(options?.widgetPages)
  const preFormattedWidgets = await preFormatWidgets(rawWidgets)
  const formattedWidgets = (await formatWidgets(
    preFormattedWidgets,
    blogStats
  )) as Record<string, unknown>

  if (formattedWidgets.profile && typeof formattedWidgets.profile === 'object') {
    const profile = formattedWidgets.profile as { links?: unknown }
    if (profile.links === undefined) profile.links = null
  }
  const socialLinksWidget = formattedWidgets['social-links']
  if (
    socialLinksWidget &&
    typeof socialLinksWidget === 'object' &&
    Array.isArray((socialLinksWidget as { links?: unknown }).links)
  ) {
    if (formattedWidgets.profile && typeof formattedWidgets.profile === 'object') {
      const profile = formattedWidgets.profile as { links?: unknown }
      profile.links = (socialLinksWidget as { links: unknown[] }).links
    }
  }

  const announcementPost =
    options && Object.prototype.hasOwnProperty.call(options, 'announcement')
      ? options.announcement ?? null
      : await getAnnouncementPost()
  if (announcementPost) {
    formattedWidgets.announcement = announcementPost
  } else if (
    formattedWidgets.announcement &&
    !isAnnouncementPost(formattedWidgets.announcement)
  ) {
    delete formattedWidgets.announcement
  }

  return formattedWidgets
}
