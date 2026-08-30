'use client'

import {
  PostNavLink,
  usePostNavLoading,
} from '@/src/components/navigation/PostNavStallGuard'
import {
  GalleryRecommendPost,
  withoutGalleryAnnouncement,
} from '@/src/lib/gallery/galleryRecommendations'
import { galleryCardTitleClass, galleryRecommendGridClass } from './galleryFonts'
import { GalleryCardLoading } from './galleryNavLoading'

function formatPostDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
}

type GalleryPostRecommendationsProps = {
  posts: GalleryRecommendPost[]
}

/** map 内逐项消费单例导航 loading 态（hooks 不能在循环里调用） */
function ItemLoading({ slug }: { slug: string }) {
  const { isLoading } = usePostNavLoading(slug)
  return <GalleryCardLoading loading={isLoading} />
}

export function GalleryPostRecommendations({
  posts,
}: GalleryPostRecommendationsProps) {
  const items = withoutGalleryAnnouncement(posts, posts.length)
  if (!items.length) return null

  return (
    <section className="mt-12 border-t border-neutral-200 pt-10">
      <h2 className="mb-6 font-gallery text-[15px] font-semibold tracking-wide text-neutral-500">
        猜你喜欢
      </h2>
      <div className={galleryRecommendGridClass}>
        {items.map((item) => (
          <PostNavLink
            key={item.slug}
            href={{ pathname: '/post/[slug]', query: { slug: item.slug } }}
            navKey={item.slug}
            className="group block"
          >
            <div className="relative aspect-[5/2] overflow-hidden rounded-lg bg-neutral-100">
              {item.coverSrc ? (
                <img
                  src={item.coverSrc}
                  alt={item.title}
                  className="h-full w-full object-cover transition-transform duration-300 ease-out will-change-transform group-hover:scale-[1.1]"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-neutral-300">
                  P
                </div>
              )}
              <ItemLoading slug={item.slug} />
            </div>
            <p
              className={`mt-2.5 line-clamp-2 group-hover:text-neutral-600 ${galleryCardTitleClass}`}
            >
              {item.title}
            </p>
            {item.date ? (
              <p className="mt-1 font-gallery text-[13px] text-neutral-400">
                {formatPostDate(item.date)}
              </p>
            ) : null}
          </PostNavLink>
        ))}
      </div>
    </section>
  )
}
