import Link from 'next/link'
import type { ShopBannerConfig } from '@/src/lib/blog/shopBannerDefaults'
import { ThemeHomeProps } from '../types'
import { ShopBanner } from './ShopBanner'
import { ShopCatalogSection } from './ShopCatalogSection'
import type { Post } from '@/src/types/blog'

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
 * shop(商城)主题首页 v1(P18-C4-2.1 重做,仿独角数卡 Home):
 * ShopNavbar(壳层)→ Banner 轮播 → 左分类栏+搜索 + 右商品化卡片网格
 * (ShopPostCard v2,客户端分类/搜索过滤)→ 公告区 → Footer(壳层)。
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

  return (
    <>
      {banner ? (
        <div
          data-aos="fade-up"
          className="mx-auto w-full px-4 pt-8 md:px-6 lg:w-screen-lg lg:px-11"
        >
          <ShopBanner banner={banner} />
        </div>
      ) : null}

      <div className="py-8">
        <ShopCatalogSection
          title="全部文章"
          posts={posts}
          galleryFeedCovers={galleryFeedCovers}
        />
      </div>

      {announcement ? (
        <section
          aria-label="最新动态"
          className="mx-auto w-full px-4 pb-12 md:px-6 lg:w-screen-lg lg:px-11"
        >
          <div data-aos="fade-up">
            <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
              最新动态
            </h2>
          </div>
          <div
            data-aos="fade-up"
            data-aos-delay={100}
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
