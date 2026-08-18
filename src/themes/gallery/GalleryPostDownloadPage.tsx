import { BlockRender } from '@/src/components/blocks/BlockRender'
import { GalleryAdBanner as GalleryAdBannerData } from '@/src/lib/gallery/loadGalleryAdBanner'
import { PostStatsSnapshot } from '@/src/lib/gallery/postStats'
import { Page, Post } from '@/src/types/blog'
import { BlockResponse } from '@/src/types/notion'
import CONFIG from '@/blog.config'
import { getSubTitleInfo } from '@/src/lib/util'
import { GalleryAdBanner } from './GalleryAdBanner'
import { GalleryBreadcrumb } from './GalleryBreadcrumb'
import { GalleryPostDownloadActions } from './GalleryPostDownloadActions'
import { GalleryPostStats } from './GalleryPostStats'
import { GalleryPostTitleLine } from './GalleryPostTitleDownloadMeta'
import { galleryEpicBarTitleClass, galleryDownloadInstructionsClass } from './galleryFonts'

type GalleryPostDownloadPageProps = {
  post: Post
  downloadInstructionBlocks: BlockResponse[]
  postStats?: PostStatsSnapshot | null
  navPages?: Page[]
  galleryAdBanner?: GalleryAdBannerData | null
}

const { CATEGORY } = CONFIG.DEFAULT_SPECIAL_PAGES

export function GalleryPostDownloadPage({
  post,
  downloadInstructionBlocks,
  postStats = null,
  navPages = [],
  galleryAdBanner = null,
}: GalleryPostDownloadPageProps) {
  const cover = post.cover?.light?.src
  const downloadValue = post.options?.download?.trim() ?? ''
  const postHref = `/post/${post.slug}`

  const categorySubTitle = getSubTitleInfo(CATEGORY, {
    navPages,
    siteSubtitle: null,
  })
  const categoryParentLabel = categorySubTitle?.text || '分类'
  const categoryParentHref = categorySubTitle?.slug
    ? `/${categorySubTitle.slug}`
    : `/${CATEGORY}`

  return (
    <>
      <GalleryBreadcrumb
        items={[
          { label: '首页', href: '/' },
          { label: categoryParentLabel, href: categoryParentHref },
          {
            label: post.category?.name || '未分类',
            href: `/${CATEGORY}/${post.category?.id || ''}`,
          },
          { label: post.title, href: postHref },
          { label: '下载' },
        ]}
      />

      <main className="flex flex-1 flex-col bg-white px-6 py-5 pb-10">
        <div className="w-full">
          <div className="mb-5 border-b border-neutral-200 pb-3">
            <GalleryPostTitleLine
              post={post}
              titleClass={galleryEpicBarTitleClass}
            />
          </div>

            <GalleryPostStats
              postSlug={post.slug}
              publishedDate={post.date?.updated || post.date?.created}
              initialStats={postStats}
              track={false}
            />

            <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-12 xl:gap-16">
              <div className="w-full shrink-0 lg:w-[42%] lg:max-w-[460px]">
                <div className="overflow-hidden rounded-md bg-neutral-100">
                  <div className="relative aspect-[10/13.35]">
                    {cover ? (
                      <img
                        src={cover}
                        alt={post.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-neutral-300">
                        P
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1 px-5 sm:px-8 lg:px-10 xl:px-12">
                {galleryAdBanner ? (
                  <GalleryAdBanner
                    banner={galleryAdBanner}
                    layout="full"
                    className="mb-6 shrink-0 bg-white"
                  />
                ) : null}

                <section className="mb-8 flex justify-center py-2">
                  <GalleryPostDownloadActions
                    postSlug={post.slug}
                    postTitle={post.title}
                    downloadContent={downloadValue}
                  />
                </section>

                <section className="pt-2">
                  {downloadInstructionBlocks.length > 0 ? (
                    <div className={galleryDownloadInstructionsClass}>
                      <BlockRender blocks={downloadInstructionBlocks} variant="gallery" />
                    </div>
                  ) : (
                    <p className="font-gallery text-[13px] leading-relaxed text-neutral-500/75">
                      暂无下载说明。请在后台「自定义页面」中编辑 slug 为{' '}
                      <code className="rounded bg-neutral-100 px-1 py-0.5 text-[13px] text-neutral-700">
                        download
                      </code>{' '}
                      的页面内容。
                    </p>
                  )}
                </section>
              </div>
            </div>
        </div>
      </main>
    </>
  )
}
