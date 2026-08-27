import CONFIG from '@/blog.config'
import { getAllCategories, initialCategory } from '@/src/lib/blog/format/category'
import { formatPosts, FORMAT_POST_LIST_OPTIONS } from '@/src/lib/blog/format/post'
import { getAllTags, initialTag } from '@/src/lib/blog/format/tag'
import { loadGalleryFeedCovers } from '@/src/lib/gallery/galleryFeedPreviews'
import { shouldLoadGalleryFeedCovers } from '@/src/lib/gallery/shouldLoadGalleryFeedCovers'
import { isShopTheme } from '@/src/themes/shop/shopTheme'
import { getPostsAndPieces } from '@/src/lib/notion/getBlogData'
import { createTagCategoryMap } from '@/src/lib/util'
import { Post } from '@/src/types/blog'
import { ApiScope } from '@/src/types/notion'

const PER_COUNT = CONFIG.ARCHIVE_PER_COUNT

export async function loadSortedArchivePosts(): Promise<Post[]> {
  const { posts } = await getPostsAndPieces(ApiScope.Archive)
  const formatted = await formatPosts(posts, FORMAT_POST_LIST_OPTIONS)
  return formatted.sort(
    (a, b) =>
      Number(new Date(b.date.created)) - Number(new Date(a.date.created))
  )
}

export function sliceArchivePage(
  posts: Post[],
  page: number,
  perCount = PER_COUNT
): Post[] {
  const safePage = Math.max(1, page)
  const start = (safePage - 1) * perCount
  return posts.slice(start, start + perCount)
}

export function filterArchivePosts(
  posts: Post[],
  options?: { tagId?: string | null; categoryId?: string | null }
): Post[] {
  const tagId = options?.tagId
  const categoryId = options?.categoryId
  if (
    (!tagId || tagId === initialTag.id) &&
    (!categoryId || categoryId === initialCategory.id)
  ) {
    return posts
  }
  return posts.filter((item) => {
    if (
      tagId &&
      tagId !== initialTag.id &&
      !item.tags.map((t) => t.id).includes(tagId)
    ) {
      return false
    }
    if (
      categoryId &&
      categoryId !== initialCategory.id &&
      item.category.id !== categoryId
    ) {
      return false
    }
    return true
  })
}

export async function buildArchivePageProps(
  currentPage: number,
  activeTheme?: string | null
) {
  const sortedPosts = await loadSortedArchivePosts()
  const tags = getAllTags(sortedPosts)
  const categories = getAllCategories(sortedPosts)
  const { tagCategoryMapById, categoryTagMapById } =
    createTagCategoryMap(sortedPosts)
  const pageCount = Math.max(1, Math.ceil(sortedPosts.length / PER_COUNT))

  let galleryFeedCovers: Record<string, string> | null = null
  if (shouldLoadGalleryFeedCovers(activeTheme) && sortedPosts.length > 0) {
    try {
      galleryFeedCovers = await loadGalleryFeedCovers(
        sortedPosts.map((p) => p.slug)
      )
    } catch (err) {
      console.error('[archive] galleryFeedCovers load failed:', err)
    }
  }

  return {
    items: sliceArchivePage(sortedPosts, currentPage),
    tags,
    categories,
    pageCount,
    tagCategoryMapById,
    categoryTagMapById,
    totalCount: sortedPosts.length,
    galleryFeedCovers,
    // P18-C4-2:shop 归档侧栏分类/标签/搜索需要对全量文章客户端过滤,
    // 仅 shop 主题额外下发全量(其余主题不下发,避免 props 膨胀)
    ...(isShopTheme(activeTheme) ? { shopAllPosts: sortedPosts } : {}),
  }
}

export async function buildFilteredArchiveFeed(options: {
  page: number
  tagId?: string | null
  categoryId?: string | null
}) {
  const sortedPosts = await loadSortedArchivePosts()
  const filtered = filterArchivePosts(sortedPosts, {
    tagId: options.tagId,
    categoryId: options.categoryId,
  })
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_COUNT))
  const safePage = Math.min(Math.max(1, options.page), pageCount)

  return {
    items: sliceArchivePage(filtered, safePage),
    pageCount,
    totalCount: filtered.length,
    currentPage: safePage,
  }
}
