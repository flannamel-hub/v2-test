import CONFIG from '@/blog.config'
import { Post } from '@/src/types/blog'
import { ApiColor } from '@/src/types/notion'
import { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { randomUUID } from 'crypto'
import { slugify } from '../../util'
import {
  readPinnedFromNotionProperties,
  sortPostsByPinnedThenDate,
} from '../pinnedPosts'
import { readCoverDarkFromPageProperties, readCoverFromPageProperties, readPageCoverUrl, readDownloadSizeFromPageProperties, readDownloadCountFromPageProperties, isArticlePasswordProtectedFromProperties, readLinkedProductSkuFromPageProperties } from '../../notion/readProperty'
import { isDefaultPostCover } from '../../gallery/postCover'
import { getImageInfo } from '../getImageInfo'
import { getImageHostConfig } from '@/src/lib/media/imageHostConfig'

export type FormatPostOptions = {
  /** 列表 / 路径收集时跳过远程封面探测，单篇正文页仍做完整探测 */
  skipImageProbe?: boolean
}

/** 列表页、归档、ISR 路径收集等场景统一使用 */
export const FORMAT_POST_LIST_OPTIONS: FormatPostOptions = {
  skipImageProbe: true,
}

/** 无分类文章的兜底显示名（与后台 FALLBACK_CATEGORY 一致，id 用 slugify 保持稳定） */
const UNCATEGORIZED_NAME = '未分类'

export const formatPosts = async (
  posts: PageObjectResponse[],
  formatOptions?: FormatPostOptions
): Promise<Post[]> => {
  await getImageHostConfig()
  const formattedPosts = await Promise.all(
    posts.map(async (post) => formatPost(post, formatOptions))
  )
  return sortPostsByPinnedThenDate(formattedPosts)
}

const formatPost = async (
  post: PageObjectResponse,
  formatOptions?: FormatPostOptions
): Promise<Post> => {
  const { id, properties } = post
  const {
    title,
    status,
    slug,
    excerpt,
    date,
    update_date,
    cover,
    cover_dark,
    category,
    tags,
    ...extraProperties
  } = properties
  const { color_title, original_cover, repost, download } = extraProperties

  const postTitle = title.type === 'title' && title.title[0]?.plain_text
  const postStatus =
    status.type === 'status' && status.status && status.status.name
  const postSlug = slug.type === 'rich_text' && slug.rich_text[0]?.plain_text
  const postExcerpt =
    excerpt.type === 'rich_text' && excerpt.rich_text[0]?.plain_text
  const postCreatedDate = date.type === 'date' && date.date && date.date.start
  const postUpdatedDate =
    update_date.type === 'last_edited_time' && update_date.last_edited_time

  const coverFromProperty =
    readCoverFromPageProperties(properties) ||
    readPageCoverUrl(post.cover) ||
    ''
  const isExplicitDefaultCover = isDefaultPostCover(coverFromProperty)

  const postCoverLightSrc = coverFromProperty || CONFIG.DEFAULT_POST_COVER
  const postCoverDarkSrc =
    readCoverDarkFromPageProperties(properties) || postCoverLightSrc

  // 默认占位数据，防止 getImageInfo 报错
  const defaultImgInfo = { width: 1200, height: 630, placeholder: '' }

  let infoLight = defaultImgInfo
  let infoDark = defaultImgInfo

  if (!formatOptions?.skipImageProbe) {
    try {
      if (postCoverLightSrc) {
        infoLight = await getImageInfo(postCoverLightSrc)
      }
    } catch (e) {
      console.warn(`⚠️ 无法获取浅色封面尺寸 (死链或超时): ${postCoverLightSrc}`)
    }

    try {
      if (postCoverDarkSrc) {
        if (postCoverDarkSrc === postCoverLightSrc) {
          infoDark = infoLight
        } else {
          infoDark = await getImageInfo(postCoverDarkSrc)
        }
      }
    } catch (e) {
      console.warn(`⚠️ 无法获取深色封面尺寸 (死链或超时): ${postCoverDarkSrc}`)
    }
  }

  const postCoverLight = {
    src: postCoverLightSrc,
    info: {
      placeholder: infoLight.placeholder,
      width: infoLight.width,
      height: infoLight.height,
    },
  }
  const postCoverDark = {
    src: postCoverDarkSrc,
    info: {
      placeholder: infoDark.placeholder,
      width: infoDark.width,
      height: infoDark.height,
    },
  }

  // =========================================================

  const postCategory =
    category.type === 'select' && category.select
      ? {
          ...category.select,
          id: slugify(category.select.name ?? randomUUID()),
        }
      : null
  const postTags =
    tags.type === 'multi_select' &&
    tags.multi_select.map((tag) => {
      return { ...tag, id: slugify(tag.name) }
    })
  const postOptions = {
    colorTitle:
      color_title.type === 'multi_select' &&
      color_title.multi_select.map((color) => color.color as ApiColor),
    originalCover:
      original_cover.type === 'checkbox' && original_cover.checkbox,
    repost: repost.type === 'url' && repost.url,
    // 下载信息：Notion 为 rich_text（可含说明+链接）；兼容旧 url 类型
    download:
      (download?.type === 'rich_text' &&
        download.rich_text?.map((t) => t.plain_text).join('')) ||
      (download?.type === 'url' && download.url) ||
      '',
    downloadSize: readDownloadSizeFromPageProperties(properties),
    downloadCount: readDownloadCountFromPageProperties(properties),
    isPasswordProtected: isArticlePasswordProtectedFromProperties(properties),
    linkedProductSku: readLinkedProductSkuFromPageProperties(properties),
  }

  const formattedPost = {
    id,
    status: postStatus ?? 'Draft',
    pinned: readPinnedFromNotionProperties(
      properties as Record<string, { type?: string; checkbox?: boolean }>
    ),
    title: postTitle ?? 'Untitled',
    slug: postSlug ?? 'unknown',
    excerpt: postExcerpt ?? '',
    date: {
      created: postCreatedDate ?? postUpdatedDate ?? new Date().toISOString(),
      updated: postUpdatedDate ?? new Date().toISOString(),
    },
    cover: {
      light: postCoverLight,
      dark: postCoverDark,
    },
    category: postCategory ?? {
      id: slugify(UNCATEGORIZED_NAME),
      name: UNCATEGORIZED_NAME,
      color: 'gray' as ApiColor,
    },
    tags: postTags ?? [
      {
        id: randomUUID(),
        name: 'Untagged',
        color: 'gray' as ApiColor,
      },
    ],
    options: {
      colorTitle: postOptions.colorTitle ?? [],
      originalCover: postOptions.originalCover ?? false,
      repost: postOptions.repost ?? '',
      download: postOptions.download ?? '',
      downloadSize: postOptions.downloadSize ?? '',
      downloadCount: postOptions.downloadCount ?? '',
      isPasswordProtected: postOptions.isPasswordProtected ?? false,
      linkedProductSku: postOptions.linkedProductSku ?? '',
      useDefaultCover: isExplicitDefaultCover,
    },
  } as Post
  return formattedPost
}

export function getNavigationInfo(
  formattedPosts: Post[],
  post: Post | undefined
) {
  if (!post) return { previousPost: null, nextPost: null }
  const postIndex = formattedPosts.findIndex((p) => p.slug === post.slug)
  const previousPost = postIndex > 0 ? formattedPosts[postIndex - 1] : null
  const nextPost =
    postIndex < formattedPosts.length - 1 ? formattedPosts[postIndex + 1] : null

  return {
    previousPost: previousPost
      ? {
          title: previousPost.title,
          slug: previousPost.slug,
          cover: previousPost.cover,
        }
      : null,
    nextPost: nextPost
      ? {
          title: nextPost.title,
          slug: nextPost.slug,
          cover: nextPost.cover,
        }
      : null,
  }
}
