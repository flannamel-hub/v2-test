/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import ContainerLayout from '@/src/components/post/ContainerLayout'
import { WidgetCollection } from '@/src/components/section/WidgetCollection'
import type { ShopBannerConfig } from '@/src/lib/blog/shopBannerDefaults'
import { ThemeHomeProps } from '../types'
import { ShopBanner } from './ShopBanner'
import { ShopPostCard } from './ShopPostCard'
import { ShopProductsSection } from './ShopProductsSection'
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
 * shop(商城)主题首页:走默认 BlogLayout 壳层(Navbar + Footer),
 * Widget/贩售机等挂载沿用现有机制。
 * P18-C4-1: 顶部 Banner 轮播(Notion widget slug=banner,仅 shop 生效);
 * 底部「最新动态」公告区读取 /announcement 文章(仅一篇,无则整块不渲染)。
 * 「全部商品」= 本站商户商品集合(主站 products-public,客户端加载);
 * 下方文章以商品化卡片网格展示。
 */
export const ShopHome = ({
  posts,
  widgets,
  vendingConfig,
  vendingEnabled,
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
      <ContainerLayout>
        {banner ? (
          <div data-aos="fade-up" className="mb-8">
            <ShopBanner banner={banner} />
          </div>
        ) : null}
        <WidgetCollection
          widgets={widgets}
          vendingConfig={vendingConfig}
          vendingEnabled={vendingEnabled !== false}
        />
        <ShopProductsSection />
        <div data-aos="fade-up" data-aos-delay={300}>
          <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
            全部文章
          </h2>
        </div>
      </ContainerLayout>
      <div className="mx-auto w-screen-lg max-w-full px-4 md:px-6">
        {posts.length === 0 ? (
          <p className="py-16 text-center text-sm text-neutral-500 dark:text-neutral-400">
            暂无内容
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 pb-16 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <ShopPostCard
                key={post.id}
                post={post}
                galleryCoverSrc={galleryFeedCovers?.[post.slug] ?? null}
              />
            ))}
          </div>
        )}
        {announcement ? (
          <section className="pb-16" aria-label="最新动态">
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
      </div>
    </>
  )
}
