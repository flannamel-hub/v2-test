import { classNames, formatDate } from '@/src/lib/util'
import { resolveListPostCover } from '@/src/lib/gallery/resolveListPostCover'
import { Post } from '@/src/types/blog'
import React from 'react'
import { PostNavLink } from '@/src/components/navigation/PostNavStallGuard'
import { PostImage } from '@/src/components/card/CardInfo'
import { ShopBuyButtons } from './ShopBuyButtons'

type ShopPostCardProps = {
  post: Post
  galleryCoverSrc?: string | null
  /** v2:网格(默认)/ 列表 两种形态 */
  variant?: 'grid' | 'list'
}

const CARD_SHELL =
  'group relative flex transform-gpu cursor-pointer select-none flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-card dark:border-white/10 dark:bg-[#1c1c1e] dark:shadow-2xl transition-all duration-300 ease-out hover:scale-[1.015]'

/** 读取 Step7 三字段;任一填写即视为商品文章(P18-C3 约定) */
function readProductFields(post: Post) {
  const linkedSku = post.options?.linkedProductSku?.trim()
  const buyUrl = post.options?.linkedProductUrl?.trim()
  const linkedPrice = post.options?.linkedProductPrice?.trim()
  return {
    linkedSku,
    buyUrl,
    linkedPrice,
    hasProduct: Boolean(linkedSku || buyUrl || linkedPrice),
  }
}

function CardCover({
  displayCover,
  title,
  categoryName,
  variant,
}: {
  displayCover: Post['cover']
  title: string
  categoryName?: string
  variant: 'grid' | 'list'
}) {
  const hasCover = Boolean(displayCover?.light?.src || displayCover?.dark?.src)
  return (
    <div
      className={classNames(
        'relative shrink-0 overflow-hidden bg-neutral-100 dark:bg-neutral-900',
        variant === 'grid' ? 'h-44 w-full' : 'h-full min-h-[7rem] w-28 sm:w-40'
      )}
    >
      {hasCover ? (
        <PostImage
          cover={displayCover}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        // v2:无封面时的渐变回退
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 via-neutral-50 to-neutral-200 dark:from-neutral-800 dark:via-neutral-900 dark:to-neutral-800">
          <span className="select-none text-xs font-semibold uppercase tracking-widest text-neutral-300 dark:text-neutral-600">
            {categoryName || title.slice(0, 1) || 'Post'}
          </span>
        </div>
      )}
    </div>
  )
}

function ProductBadge() {
  return (
    <span className="absolute left-3 top-3 rounded-md bg-green-600/90 px-2 py-0.5 text-[11px] font-bold text-white">
      商品
    </span>
  )
}

/**
 * shop 主题文章卡片 v2(P18-C4-2.3)。
 * 商品文章:封面 + 标题 + 商品码/价格 + 立即购买/加入购物车;
 * 普通文章:封面 + 标题 + 摘要 + 日期/阅读入口。
 * variant="grid" 网格卡 / variant="list" 横向列表卡。
 */
export function ShopPostCard({
  post,
  galleryCoverSrc,
  variant = 'grid',
}: ShopPostCardProps) {
  const { title, slug, date, category } = post
  const displayCover = resolveListPostCover(post, galleryCoverSrc)
  const { linkedSku, buyUrl, linkedPrice, hasProduct } = readProductFields(post)

  return (
    <React.StrictMode>
      <PostNavLink href={{ pathname: '/post/[slug]', query: { slug } }} navKey={slug}>
        <div
          className={classNames(
            CARD_SHELL,
            variant === 'list' ? 'flex-row items-stretch' : ''
          )}
        >
          <div className="relative">
            <CardCover
              displayCover={displayCover}
              title={title}
              categoryName={category?.name}
              variant={variant}
            />
            {hasProduct ? <ProductBadge /> : null}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4 sm:p-5">
            <p className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
              {category?.name}
            </p>
            <h2
              className={classNames(
                'line-clamp-2 font-extrabold leading-tight tracking-tight text-neutral-900 dark:text-white',
                variant === 'list' ? 'text-[15px] sm:text-base' : 'text-lg'
              )}
            >
              {title}
            </h2>

            {hasProduct ? (
              <div className="mt-auto flex flex-col gap-2 pt-1">
                {linkedSku || linkedPrice ? (
                  <div className="flex min-w-0 items-baseline justify-between gap-2">
                    {linkedSku ? (
                      <span className="truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                        商品码:{linkedSku}
                      </span>
                    ) : (
                      <span />
                    )}
                    {linkedPrice ? (
                      <span className="shrink-0 text-base font-extrabold text-rose-600 dark:text-rose-400">
                        {linkedPrice}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <ShopBuyButtons
                  sku={linkedSku}
                  buyUrl={buyUrl}
                  name={title}
                  price={linkedPrice}
                  variant="card"
                />
              </div>
            ) : (
              <div className="mt-auto flex flex-col gap-2 pt-1">
                {post.excerpt ? (
                  <p className="line-clamp-2 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                    {post.excerpt}
                  </p>
                ) : null}
                <div className="flex items-center justify-between border-t border-neutral-100 pt-2.5 dark:border-white/5">
                  <time
                    dateTime={date.created}
                    className="text-xs font-semibold text-neutral-500 dark:text-neutral-400"
                  >
                    {formatDate(date.created)}
                  </time>
                  <span className="text-[11px] font-semibold text-neutral-400 transition-colors group-hover:text-neutral-900 dark:text-neutral-500 dark:group-hover:text-white">
                    阅读
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </PostNavLink>
    </React.StrictMode>
  )
}
