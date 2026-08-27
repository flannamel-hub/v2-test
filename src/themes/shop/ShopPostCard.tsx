import { FiArrowRight, FiChevronRight } from 'react-icons/fi'
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
  /** v3:网格(默认)/ 列表 两种形态 */
  variant?: 'grid' | 'list'
}

/** P18-C4-4B:独角数卡 ProductCard 版式(微上浮+阴影+描边提亮) */
const CARD_SHELL =
  'group relative flex h-full cursor-pointer select-none flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-card transition-all duration-300 ease-out hover:-translate-y-1 hover:border-neutral-900/30 hover:shadow-lg dark:border-white/10 dark:bg-[#1c1c1e] dark:hover:border-white/30'

/** 封面右上图上标签(独角数卡同款:黑底白字毛玻璃小胶囊) */
const IMAGE_TAG_BADGE =
  'inline-flex items-center rounded-md border border-white/25 bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm md:px-3'

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
  imageTags,
}: {
  displayCover: Post['cover']
  title: string
  categoryName?: string
  variant: 'grid' | 'list'
  /** 图上标签:文章 tags 前 2 个(仅网格形态渲染) */
  imageTags: { id?: string; name: string }[]
}) {
  const hasCover = Boolean(displayCover?.light?.src || displayCover?.dark?.src)
  return (
    <div
      className={classNames(
        'relative shrink-0 overflow-hidden bg-neutral-100 dark:bg-neutral-900',
        variant === 'grid' ? 'aspect-[4/3] w-full' : 'h-full min-h-[7rem] w-28 sm:w-40'
      )}
    >
      {hasCover ? (
        <PostImage
          cover={displayCover}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        // v3:无封面时的渐变回退(保留)
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 via-neutral-50 to-neutral-200 dark:from-neutral-800 dark:via-neutral-900 dark:to-neutral-800">
          <span className="select-none text-xs font-semibold uppercase tracking-widest text-neutral-300 dark:text-neutral-600">
            {categoryName || title.slice(0, 1) || 'Post'}
          </span>
        </div>
      )}

      {variant === 'grid' && imageTags.length > 0 ? (
        <div className="absolute right-2 top-2 z-20 flex flex-wrap justify-end gap-1 md:right-4 md:top-4 md:gap-2">
          {imageTags.map((tag) => (
            <span key={tag.id || tag.name} className={IMAGE_TAG_BADGE}>
              {tag.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * shop 主题文章卡片 v3(P18-C4-4B,按独角数卡 ProductCard.vue 逐点还原)。
 * 封面(4/3,图上标签=文章 tags 前 2 个)+ 信息区(分类行/紧凑标题/商品徽章)
 * + 底栏(商品→「价格」标签+大号价格+购物车图标按钮+详情箭头;无商品→日期+「阅读」箭头)。
 * variant="grid" 网格卡 / variant="list" 横向列表卡(左缩略图右信息)。
 */
export function ShopPostCard({
  post,
  galleryCoverSrc,
  variant = 'grid',
}: ShopPostCardProps) {
  const { title, slug, date, category, tags } = post
  const displayCover = resolveListPostCover(post, galleryCoverSrc)
  const { linkedSku, buyUrl, linkedPrice, hasProduct } = readProductFields(post)
  const imageTags = (tags || []).slice(0, 2)
  const showPrice = hasProduct && Boolean(linkedPrice)

  const detailArrowClass =
    'hidden items-center gap-1 text-xs font-bold uppercase text-neutral-500 transition-colors duration-200 ease-out group-hover:text-neutral-900 dark:text-neutral-400 dark:group-hover:text-white md:flex'

  return (
    <React.StrictMode>
      <PostNavLink href={{ pathname: '/post/[slug]', query: { slug } }} navKey={slug}>
        <div
          className={classNames(
            CARD_SHELL,
            variant === 'list' ? 'flex-row items-stretch' : ''
          )}
        >
          <CardCover
            displayCover={displayCover}
            title={title}
            categoryName={category?.name}
            variant={variant}
            imageTags={imageTags}
          />

          <div className="flex min-w-0 flex-1 flex-col p-3 md:p-4">
            {category?.name ? (
              <div className="mb-1 truncate text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 md:mb-2">
                分类 · {category.name}
              </div>
            ) : null}
            <h2 className="line-clamp-2 text-sm font-bold leading-tight tracking-tight text-neutral-900 dark:text-white md:text-base">
              {title}
            </h2>

            {hasProduct ? (
              <div className="mt-2 flex flex-wrap items-center gap-1 md:gap-2">
                <span className="inline-flex items-center rounded-md bg-green-50 px-1.5 py-0.5 text-[11px] font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-400">
                  商品可购
                </span>
              </div>
            ) : null}

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-neutral-100 pt-2 dark:border-white/10 md:pt-4">
              {showPrice ? (
                <div className="flex min-w-0 flex-col">
                  <span className="hidden text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 md:block">
                    价格
                  </span>
                  <span className="text-sm font-bold text-rose-600 dark:text-rose-400 md:text-base">
                    {linkedPrice}
                  </span>
                </div>
              ) : (
                <time
                  dateTime={date.created}
                  className="truncate text-xs font-semibold text-neutral-500 dark:text-neutral-400"
                >
                  {formatDate(date.created)}
                </time>
              )}

              <div className="flex shrink-0 items-center gap-2">
                {hasProduct ? (
                  <ShopBuyButtons
                    variant="icon"
                    sku={linkedSku}
                    buyUrl={buyUrl}
                    name={title}
                    price={linkedPrice}
                  />
                ) : null}
                {hasProduct ? (
                  <span className={detailArrowClass}>
                    <FiArrowRight
                      className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-1"
                      aria-hidden
                    />
                  </span>
                ) : (
                  <span className={detailArrowClass}>
                    阅读
                    <FiArrowRight
                      className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-1"
                      aria-hidden
                    />
                  </span>
                )}
                <FiChevronRight
                  className="h-4 w-4 text-neutral-400 dark:text-neutral-500 md:hidden"
                  aria-hidden
                />
              </div>
            </div>
          </div>
        </div>
      </PostNavLink>
    </React.StrictMode>
  )
}
