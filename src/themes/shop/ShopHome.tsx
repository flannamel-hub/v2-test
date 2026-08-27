import type { ShopBannerConfig } from '@/src/lib/blog/shopBannerDefaults'
import { classNames } from '@/src/lib/util'
import { ShopBanner } from './ShopBanner'
import { ShopPostCard } from './ShopPostCard'
import Link from 'next/link'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { useMemo, useRef, useState } from 'react'
import type { ThemeHomeProps } from '@/src/themes/types'
import type { Post } from '@/src/types/blog'

/** B1:首页精选区客户端分页,每页 8 个(lg+ 网格 2 排 × 4) */
export const SHOP_FEATURED_PAGE_SIZE = 8

/** 读取 Step7 三字段;任一填写即视为商品文章(P18-C3 约定,与 ShopPostCard 一致) */
function hasProductField(post: Post): boolean {
  const o = post.options
  return Boolean(
    o?.linkedProductSku?.trim() || o?.linkedProductUrl?.trim() || o?.linkedProductPrice?.trim()
  )
}

/** B1:「带商品优先」稳定分区排序:商品文章在前,组内保持原顺序 */
export function sortFeaturedPosts(posts: Post[]): Post[] {
  const withProduct: Post[] = []
  const rest: Post[] = []
  for (const post of posts) {
    ;(hasProductField(post) ? withProduct : rest).push(post)
  }
  return [...withProduct, ...rest]
}

/** B1:按页切片(1 起) */
export function sliceFeaturedPage(
  posts: Post[],
  page: number,
  pageSize = SHOP_FEATURED_PAGE_SIZE
): Post[] {
  const start = (Math.max(1, page) - 1) * pageSize
  return posts.slice(start, start + pageSize)
}

/** B2:分页页码窗口(当前页前后各 2 页,最多 5 个,同独角数卡 Products) */
export function getFeaturedPageWindow(
  currentPage: number,
  totalPages: number
): number[] {
  const start = Math.max(1, currentPage - 2)
  const end = Math.min(totalPages, start + 4)
  const realStart = Math.max(1, end - 4)
  const pages: number[] = []
  for (let p = realStart; p <= end; p++) pages.push(p)
  return pages
}

/** 读取公告文章(widgets.announcement,仅一篇) */
function readAnnouncementPost(widgets: {
  [key: string]: unknown
}): Post | null {
  const announcement = widgets.announcement
  if (!announcement || typeof announcement !== 'object') return null
  const post = announcement as Post
  if (typeof post.slug !== 'string' || typeof post.title !== 'string') return null
  return post
}

/** B2:分页圆角按钮基样式(独角数卡 products 分页) */
const PAGE_BUTTON_BASE =
  'grid h-10 min-w-[40px] place-items-center rounded-full border border-neutral-200 bg-white px-3 transition-colors duration-200 ease-out dark:border-white/10 dark:bg-[#1c1c1e]'

/**
 * Shop 首页(v3 修正 2026-08-28 P18-C4-4 批1):仿独角数卡 Home.vue
 * Banner(Hero) → 精选商品 Featured Products(标题+商品化卡片网格,B1 每页 8 个客户端分页)
 * → 最新动态 Latest Updates(公告卡) → Footer(壳层)。
 * 精选区展示全部文章(C4-3B 修正):有商品字段渲染商品卡,无商品渲染普通卡;
 * 商品文章稳定前置(带商品优先),总数 >8 时底部显示分页控件(B2)。
 */
export const ShopHome = ({
  posts,
  widgets,
  galleryFeedCovers,
  shopBanner,
}: ThemeHomeProps) => {
  const banner: ShopBannerConfig | null =
    shopBanner && shopBanner.enabled && shopBanner.images.length > 0
      ? shopBanner
      : null
  const announcement = readAnnouncementPost(widgets)

  // B1:「带商品优先」featured 列表 + 每页 8 个客户端分页
  const featured = useMemo(() => sortFeaturedPosts(posts), [posts])
  const totalPages = Math.max(1, Math.ceil(featured.length / SHOP_FEATURED_PAGE_SIZE))
  const [currentPage, setCurrentPage] = useState(1)
  const featuredRef = useRef<HTMLElement | null>(null)

  const goToPage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages)
    setCurrentPage(clamped)
    // B2:切换分页后平滑滚动回商品区顶部(scroll-mt 补偿 fixed 导航)
    if (featuredRef.current) {
      const reduceMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      featuredRef.current.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      })
    }
  }

  const pageItems = sliceFeaturedPage(featured, currentPage)

  return (
    <>
      {banner ? (
        <div
          data-aos="fade-up"
          className="mx-auto w-full max-w-7xl px-4 pt-8 md:px-6"
        >
          <ShopBanner
            banner={banner}
            headline={
              (widgets?.profile as { name?: string } | undefined)?.name || undefined
            }
            subline={
              (widgets?.profile as { description?: string } | undefined)
                ?.description || undefined
            }
          />
        </div>
      ) : null}

      {/* 精选商品 Featured Products */}
      <section
        ref={featuredRef}
        aria-label="精选商品"
        className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-10 md:px-6"
      >
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white md:text-3xl">
              精选商品
            </h2>
          </div>
        </div>

        {/* B1:lg+ 4 列 × 2 排 = 每页 8 个;小屏自动折行 */}
        <div className="grid grid-cols-2 items-stretch gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {pageItems.map((post) => (
            <ShopPostCard
              key={post.id || post.slug}
              post={post}
              galleryCoverSrc={galleryFeedCovers?.[post.slug] ?? null}
            />
          ))}
        </div>

        {/* B2:分页控件(总数 ≤8 不渲染;独角数卡圆角按钮版式) */}
        {featured.length > SHOP_FEATURED_PAGE_SIZE ? (
          <nav
            aria-label="精选商品分页"
            className="mt-8 flex justify-center gap-2"
          >
            <button
              type="button"
              aria-label="上一页"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              className={classNames(
                PAGE_BUTTON_BASE,
                'text-neutral-500 hover:border-neutral-900 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:border-white dark:hover:text-white'
              )}
            >
              <FiChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            {getFeaturedPageWindow(currentPage, totalPages).map((p) => (
              <button
                key={p}
                type="button"
                aria-current={p === currentPage ? 'page' : undefined}
                onClick={() => goToPage(p)}
                className={classNames(
                  PAGE_BUTTON_BASE,
                  'text-sm font-bold',
                  p === currentPage
                    ? 'border-transparent bg-neutral-900 text-white dark:bg-white dark:text-black'
                    : 'text-neutral-500 hover:border-neutral-900 hover:text-neutral-900 dark:text-neutral-400 dark:hover:border-white dark:hover:text-white'
                )}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              aria-label="下一页"
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
              className={classNames(
                PAGE_BUTTON_BASE,
                'text-neutral-500 hover:border-neutral-900 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400 dark:hover:border-white dark:hover:text-white'
              )}
            >
              <FiChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </nav>
        ) : null}
      </section>

      {/* 最新动态 Latest Updates */}
      {announcement ? (
        <section
          aria-label="最新动态"
          className="mx-auto w-full max-w-7xl px-4 pb-14 md:px-6"
        >
          <hr className="mb-8 border-neutral-200/70 dark:border-neutral-800/70" />
          <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
            最新动态
          </h2>
          {/* F1:整卡可点,点击任意位置进入公告内页 */}
          <Link
            href={`/post/${announcement.slug}`}
            data-aos="fade-up"
            className="block rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-card transition-shadow hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/20 dark:border-neutral-800/70 dark:bg-neutral-900 dark:focus-visible:ring-white/30 md:p-6"
          >
            <div className="mb-2 text-xs text-neutral-400 dark:text-neutral-500">
              {announcement.date?.created || ''}
            </div>
            <h3 className="line-clamp-2 text-base font-semibold text-neutral-900 dark:text-white">
              {announcement.title}
            </h3>
            {announcement.excerpt ? (
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                {announcement.excerpt}
              </p>
            ) : null}
            <span className="mt-4 inline-flex items-center text-sm font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-4 dark:text-white dark:decoration-neutral-600">
              查看详情
            </span>
          </Link>
        </section>
      ) : null}
    </>
  )
}
