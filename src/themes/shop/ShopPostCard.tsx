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

/** 封面左下图上标签(独角数卡同款:黑底白字毛玻璃小胶囊) */
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

/** P18-C4-3 B2:统一 ¥ 人民币前缀(去重已带的 ¥/￥,避免 ¥¥) */
function formatPriceLabel(price: string): string {
  return `¥${price.trim().replace(/^[¥￥]\s*/, '')}`
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
        // P18-C4-3 B3:标签移至封面左下角(独角数卡黑底半透明胶囊)
        <div className="absolute bottom-2 left-2 z-20 flex flex-wrap justify-start gap-1 md:bottom-4 md:left-4 md:gap-2">
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
 * shop 主题文章卡片 v4(P18-C4-3 批2,按独角数卡 ProductCard.vue 逐点还原 + 同构等高)。
 * - 封面(4/3,group-hover 缩放)+ 封面左下角黑底半透明 tags 标签(前 2 个);
 * - 信息区各 行固定高度同构(B1):分类行(h-4)/标题(line-clamp-2 固定两行高)/
 *   徽章行(h-5,仅商品卡显示「商品可购」但保留行高)——商品卡与普通卡网格不参差;
 * - 底栏(border-t + pt)左侧统一两行结构(B1):商品卡=小标「价格」+ ¥ 大号白色价格(B2),
 *   普通卡=小标「发布于」+ 日期;右侧=购物车图标按钮(带 sku 已购份数角标,B4)+「→」箭头。
 * variant="grid" 网格卡 / variant="list" 横向列表卡(左缩略图右信息,同构等高)。
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

  // B1:底栏值行与价格行同字号/字重/行高,保证商品卡与普通卡底栏等高
  const footerValueClass =
    'truncate text-base font-bold leading-tight tracking-tight md:text-lg'

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
            {/* B1:分类行固定高度,无分类用占位保持行高 */}
            <div className="mb-1 h-4 truncate text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 md:mb-2">
              {category?.name ? `分类 · ${category.name}` : '\u00A0'}
            </div>
            <h2 className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-tight tracking-tight text-neutral-900 dark:text-white md:min-h-[3rem] md:text-base">
              {title}
            </h2>

            {/* B1:徽章行固定高度(普通卡留空占位,保证与商品卡等高) */}
            <div className="mt-2 flex h-5 flex-wrap items-center gap-1 md:gap-2">
              {hasProduct ? (
                <span className="inline-flex items-center rounded-md bg-green-50 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-green-700 dark:bg-green-500/10 dark:text-green-400">
                  商品可购
                </span>
              ) : null}
            </div>

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-neutral-100 pt-2 dark:border-white/10 md:pt-4">
              {showPrice ? (
                <div className="flex min-w-0 flex-col">
                  <span className="hidden text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 md:block">
                    价格
                  </span>
                  {/* B2:¥ 前缀 + 白色价格(亮/暗同白)+ 加粗放大(独角数卡 theme-price-sm) */}
                  <span
                    data-testid="shop-card-price"
                    className={classNames(footerValueClass, 'text-white')}
                  >
                    {formatPriceLabel(linkedPrice!)}
                  </span>
                </div>
              ) : (
                <div className="flex min-w-0 flex-col">
                  <span className="hidden text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 md:block">
                    发布于
                  </span>
                  <time
                    dateTime={date.created}
                    className={classNames(footerValueClass, 'text-neutral-900 dark:text-white')}
                  >
                    {formatDate(date.created)}
                  </time>
                </div>
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
