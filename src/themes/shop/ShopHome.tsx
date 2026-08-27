import type { ShopBannerConfig } from '@/src/lib/blog/shopBannerDefaults'
import { ShopBanner } from './ShopBanner'
import { ShopPostCard } from './ShopPostCard'
import Link from 'next/link'
import type { ThemeHomeProps } from '@/src/themes/types'
import type { Post } from '@/src/types/blog'

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

/**
 * Shop 首页(v2 修正 2026-08-28 P18-C4-4B):仿独角数卡 Home.vue
 * Banner(Hero) → 精选商品 Featured Products(标题+副标题+商品化卡片网格)
 * → 最新动态 Latest Updates(公告卡) → Footer(壳层)。
 * 精选区展示全部文章(C4-3B 修正):有商品字段渲染商品卡,无商品渲染普通卡。
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

  const hasProduct = (p: (typeof posts)[number]) =>
    Boolean(
      p.options?.linkedProductSku?.trim() ||
        p.options?.linkedProductUrl?.trim() ||
        p.options?.linkedProductPrice?.trim()
    )
  // C4-4B:展示全部文章(不再只筛商品文章),前 10 篇
  const hasAnyProduct = posts.some(hasProduct)
  const featured = posts.slice(0, 10)

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
      <section className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white md:text-3xl">
              精选商品
            </h2>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              {hasAnyProduct
                ? '本站精选的数字作品与商品'
                : '最新发布的内容'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {featured.map((post, idx) => (
            <ShopPostCard
              key={post.id || post.slug}
              post={post}
              galleryCoverSrc={galleryFeedCovers?.[post.slug] ?? null}
            />
          ))}
        </div>
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
          <div
            data-aos="fade-up"
            className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-card transition-shadow hover:shadow-lg dark:border-neutral-800/70 dark:bg-neutral-900 md:p-6"
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
            <Link
              href={`/post/${announcement.slug}`}
              className="mt-4 inline-flex items-center text-sm font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-4 transition-colors hover:decoration-neutral-900 dark:text-white dark:decoration-neutral-600 dark:hover:decoration-white"
            >
              阅读全文
            </Link>
          </div>
        </section>
      ) : null}
    </>
  )
}
