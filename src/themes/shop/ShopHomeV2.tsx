import type { ShopBannerConfig } from '@/src/lib/blog/shopBannerDefaults'
import { ShopBanner } from './ShopBanner'
import { ShopPagination } from './ShopPagination'
import { ShopPostCardLarge } from './ShopPostCardLarge'
import {
  sliceFeaturedPage,
  sortFeaturedPosts,
} from './ShopHome'
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import type { ThemeHomeProps } from '@/src/themes/types'
import type { Post } from '@/src/types/blog'

/**
 * P18-C4-7:shop-v2 首页 = shop 首页变体(单列大卡橱窗)。
 * Banner/标题行/最新动态/容器与 shop 首页一致,仅精选区由「网格小卡(每页 8)」
 * 改为「单列大卡(ShopPostCardLarge,全宽与 Banner 对齐,每页 4 张)」;
 * 商品文章稳定前置(复用 sortFeaturedPosts),分页复用 ShopPagination。
 */
export const SHOP_V2_PAGE_SIZE = 4

/** 读取公告文章(widgets.announcement,仅一篇;与 ShopHome 同逻辑) */
function readAnnouncementPost(widgets: {
  [key: string]: unknown
}): Post | null {
  const announcement = widgets.announcement
  if (!announcement || typeof announcement !== 'object') return null
  const post = announcement as Post
  if (typeof post.slug !== 'string' || typeof post.title !== 'string') return null
  return post
}

export const ShopHomeV2 = ({
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

  // 商品文章优先 + 每页 4 张客户端分页(复用 shop 精选区实现)
  const featured = useMemo(() => sortFeaturedPosts(posts), [posts])
  const totalPages = Math.max(1, Math.ceil(featured.length / SHOP_V2_PAGE_SIZE))
  const [currentPage, setCurrentPage] = useState(1)
  const featuredRef = useRef<HTMLElement | null>(null)

  const goToPage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages)
    setCurrentPage(clamped)
    // 切换分页后平滑滚动回商品区顶部(scroll-mt 补偿 fixed 导航)
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

  const pageItems = sliceFeaturedPage(featured, currentPage, SHOP_V2_PAGE_SIZE)

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

      {/* 精选商品 Featured Products(标题行与 shop 首页一致,无「查看全部」) */}
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

        {/* 单列大卡列表:全宽与 Banner 对齐,gap-6 纵向排列 */}
        <div
          data-testid="shop-v2-card-list"
          className="flex flex-col gap-6"
        >
          {pageItems.map((post) => (
            <ShopPostCardLarge
              key={post.id || post.slug}
              post={post}
              galleryCoverSrc={galleryFeedCovers?.[post.slug] ?? null}
            />
          ))}
        </div>

        {/* 分页:每页 4 张,复用 ShopPagination(totalPages ≤ 1 时组件内部不渲染) */}
        <ShopPagination
          ariaLabel="精选商品分页"
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
        />
      </section>

      {/* 最新动态 Latest Updates(与 shop 首页一致) */}
      {announcement ? (
        <section
          aria-label="最新动态"
          className="mx-auto w-full max-w-7xl px-4 pb-14 md:px-6"
        >
          <hr className="mb-8 border-neutral-200/70 dark:border-neutral-800/70" />
          <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
            最新动态
          </h2>
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

