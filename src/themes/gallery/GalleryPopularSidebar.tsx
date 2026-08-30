'use client'

import { useEffect, useState } from 'react'
import {
  PostNavLink,
  usePostNavLoading,
} from '@/src/components/navigation/PostNavStallGuard'
import {
  GalleryRecommendPost,
  withoutGalleryAnnouncement,
} from '@/src/lib/gallery/galleryRecommendations'
import { GalleryCardLoading } from './galleryNavLoading'

/** Epic 侧边栏：左侧横版缩略图 + 右侧标题/日期（标题顶对齐封面） */
const THUMB_CLASS = 'w-[108px] shrink-0 overflow-hidden rounded-[4px] bg-neutral-100'
const COVER_ASPECT = 'aspect-[4/3]'

function formatEpicDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

type GalleryPopularSidebarProps = {
  posts: GalleryRecommendPost[]
  excludeSlug?: string
  className?: string
}

/** map 内逐项消费单例导航 loading 态（hooks 不能在循环里调用） */
function ItemLoading({ slug }: { slug: string }) {
  const { isLoading } = usePostNavLoading(slug)
  return <GalleryCardLoading loading={isLoading} />
}

/** Gallery Epic 风格：内页右侧「热门推荐」（支持 Supabase 热度刷新） */
export function GalleryPopularSidebar({
  posts: initialPosts,
  excludeSlug = '',
  className = '',
}: GalleryPopularSidebarProps) {
  const [posts, setPosts] = useState(() =>
    withoutGalleryAnnouncement(initialPosts)
  )

  useEffect(() => {
    setPosts(withoutGalleryAnnouncement(initialPosts))
  }, [initialPosts])

  useEffect(() => {
    if (!excludeSlug) return
    let cancelled = false
    fetch(
      `/api/gallery/post-stats?mode=popular&exclude=${encodeURIComponent(excludeSlug)}&limit=6`
    )
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.success && Array.isArray(data.posts) && data.posts.length) {
          setPosts(withoutGalleryAnnouncement(data.posts))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [excludeSlug])

  if (!posts.length) return null

  return (
    <aside
      className={`w-[272px] shrink-0 border-neutral-200 lg:border-l lg:pl-8 ${className}`.trim()}
    >
      <h2 className="mb-5 font-gallery text-[14px] font-normal tracking-wide text-neutral-400">
        热门推荐
      </h2>
      <ul className="flex flex-col gap-6">
        {posts.map((item) => (
          <li key={item.slug}>
            <PostNavLink
              href={{ pathname: '/post/[slug]', query: { slug: item.slug } }}
              navKey={item.slug}
              className="group flex items-start gap-3.5"
            >
              <div className={THUMB_CLASS}>
                <div className={`relative ${COVER_ASPECT}`}>
                  {item.coverSrc ? (
                    <img
                      src={item.coverSrc}
                      alt=""
                      className="h-full w-full object-cover object-[center_20%] transition-transform duration-300 ease-out will-change-transform group-hover:scale-[1.12]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-base font-semibold text-neutral-300">
                      P
                    </div>
                  )}
                  <ItemLoading slug={item.slug} />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-gallery text-[14px] font-normal leading-[1.35] text-neutral-900 transition-colors group-hover:text-neutral-500">
                  {item.title}
                </p>
                {item.date ? (
                  <p className="mt-1.5 font-gallery text-[13px] text-neutral-400">
                    {formatEpicDate(item.date)}
                  </p>
                ) : null}
              </div>
            </PostNavLink>
          </li>
        ))}
      </ul>
    </aside>
  )
}
