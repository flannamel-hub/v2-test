import { classNames, formatDate } from '@/src/lib/util'
import { resolveListPostCover } from '@/src/lib/gallery/resolveListPostCover'
import { Post } from '@/src/types/blog'
import React from 'react'
import { PostNavLink } from '@/src/components/navigation/PostNavStallGuard'
import { PostImage } from '@/src/components/card/CardInfo'

type ShopPostCardProps = {
  post: Post
  galleryCoverSrc?: string | null
}

/** shop 主题文章卡片（商品化样式）；C2 将在卡片上加购买按钮 */
export function ShopPostCard({ post, galleryCoverSrc }: ShopPostCardProps) {
  const { title, slug, cover, date, category } = post
  const displayCover = resolveListPostCover(post, galleryCoverSrc)
  const linkedSku = post.options?.linkedProductSku?.trim()

  return (
    <React.StrictMode>
      <PostNavLink href={{ pathname: '/post/[slug]', query: { slug } }} navKey={slug}>
        <div
          className={classNames(
            'group relative flex h-full transform-gpu cursor-pointer select-none flex-col overflow-hidden',
            'rounded-2xl border border-neutral-200 bg-white shadow-card',
            'dark:border-white/10 dark:bg-[#1c1c1e] dark:shadow-2xl',
            'transition-all duration-300 ease-out hover:scale-[1.015]'
          )}
        >
          <header className="relative h-44 w-full shrink-0 overflow-hidden">
            <PostImage
              cover={displayCover}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {linkedSku ? (
              <span className="absolute left-3 top-3 rounded-md bg-green-600/90 px-2 py-0.5 text-[11px] font-bold text-white">
                商品
              </span>
            ) : null}
          </header>

          <div className="flex flex-1 flex-col justify-between gap-2 p-5">
            <article className="flex flex-col items-start gap-1.5">
              <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
                {category?.name}
              </p>
              <h2 className="line-clamp-2 text-lg font-extrabold leading-tight tracking-tight text-neutral-900 dark:text-white">
                {title}
              </h2>
              {post.excerpt ? (
                <p className="line-clamp-2 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {post.excerpt}
                </p>
              ) : null}
            </article>

            <div className="flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-white/5">
              <time
                dateTime={date.created}
                className="text-xs font-semibold text-neutral-500 dark:text-neutral-400"
              >
                {formatDate(date.created)}
              </time>
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                阅读详情
              </span>
            </div>
          </div>
        </div>
      </PostNavLink>
    </React.StrictMode>
  )
}
