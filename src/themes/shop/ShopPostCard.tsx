import { FiArrowRight, FiChevronRight } from 'react-icons/fi'
import { classNames, formatDate } from '@/src/lib/util'
import { resolveListPostCover } from '@/src/lib/gallery/resolveListPostCover'
import { Post } from '@/src/types/blog'
import React, { useEffect, useRef, useState } from 'react'
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

/** C1:标题下 Notion tags 单行 chip 样式(紧凑中性小胶囊) */
const TAG_CHIP_CLASS =
  'min-w-0 max-w-full truncate rounded-md bg-neutral-100 px-1.5 text-[11px] font-medium leading-none text-neutral-500 dark:bg-white/10 dark:text-neutral-400'

/**
 * 读取 Step7 三字段;P18C45FIX B1:hasProduct 仅看 sku 非空
 * (查不到/下架仅存码也算商品文章,价格缺失显示「—」;url/price 不再参与判定)
 */
function readProductFields(post: Post) {
  const linkedSku = post.options?.linkedProductSku?.trim()
  const buyUrl = post.options?.linkedProductUrl?.trim()
  const linkedPrice = post.options?.linkedProductPrice?.trim()
  return {
    linkedSku,
    buyUrl,
    linkedPrice,
    hasProduct: Boolean(linkedSku),
  }
}

/** P18-C4-3 B2:统一 ¥ 人民币前缀(去重已带的 ¥/￥,避免 ¥¥) */
function formatPriceLabel(price: string): string {
  return `¥${price.trim().replace(/^[¥￥]\s*/, '')}`
}

/**
 * C1(P18-C4-4 批2):单行 tags 折叠算法——返回可见 chip 数,余下折叠为「+N」。
 * 全部放得下返回 count;溢出时逐个累加,超出「可用宽 - +N 预留宽」即停,
 * 且至少保留 1 个。纯函数,供挂载后测量与冒烟直测。
 */
export function foldSingleLineTags(
  widths: number[],
  availableWidth: number,
  gap = 4,
  moreReserve = 40
): number {
  const count = widths.length
  if (count <= 1) return count
  const total = widths.reduce((sum, w, i) => sum + w + (i > 0 ? gap : 0), 0)
  if (total <= availableWidth) return count
  let used = 0
  let visible = 1
  for (let i = 0; i < count; i++) {
    const w = widths[i] + (i > 0 ? gap : 0)
    if (used + w > availableWidth - moreReserve) break
    used += w
    visible = i + 1
  }
  return Math.min(visible, count)
}

/**
 * C1(P18-C4-4 批2):卡片标题下 Notion tags 单行(post.tags,站长自行设定)。
 * - 固定 h-6 只占一行,无 tag 也保留空行占位 → 商品卡/普通卡网格等高;
 * - 超宽截断:挂载后按 clientWidth 测量折叠为「+N」(resize 重算;被折叠的
 *   chip 以 absolute invisible 留在 DOM 供测量),SSR/首帧全量渲染由
 *   overflow-hidden 保证不换行;
 * - 与独角数卡区分:独角数卡该位置是系统状态徽章(游客可购/人工交付等),
 *   我们这里是站长的 Notion tags,仅展示位置相同、语义不同,勿混。
 */
function CardTagLine({ tags }: { tags: { id?: string; name: string }[] }) {
  const rowRef = useRef<HTMLDivElement | null>(null)
  const chipRefs = useRef<(HTMLSpanElement | null)[]>([])
  // visibleCount != null:仅下标 < visibleCount 的 chip 可见,余下折叠为 +N;
  // null = 全部可见(未测量或放得下)
  const [visibleCount, setVisibleCount] = useState<number | null>(null)
  const tagKey = tags.map((t) => t.name).join('\u0000')

  useEffect(() => {
    const names = tagKey ? tagKey.split('\u0000') : []
    const count = names.length
    chipRefs.current.length = count
    if (count <= 1) {
      setVisibleCount(null)
      return
    }
    const compute = () => {
      const row = rowRef.current
      if (!row) return
      const width = row.clientWidth
      if (!width) return
      const widths = names.map((_, i) => chipRefs.current[i]?.offsetWidth ?? 0)
      const visible = foldSingleLineTags(widths, width)
      setVisibleCount(visible < count ? visible : null)
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [tagKey])

  if (tags.length === 0) {
    // 无 tag 固定占一行高度,保证卡片等高
    return (
      <div data-testid="shop-card-tags" aria-hidden="true" className="mt-1.5 h-6 md:mt-2" />
    )
  }
  const hiddenCount =
    visibleCount != null && visibleCount < tags.length ? tags.length - visibleCount : 0
  return (
    <div
      data-testid="shop-card-tags"
      className="mt-1.5 flex h-6 items-center gap-1 overflow-hidden md:mt-2"
    >
      {tags.map((tag, i) => {
        const hidden = visibleCount != null && i >= visibleCount
        return (
          <span
            key={tag.id || tag.name}
            ref={(el) => {
              chipRefs.current[i] = el
            }}
            className={classNames(
              TAG_CHIP_CLASS,
              hidden ? 'absolute invisible' : 'shrink-0'
            )}
          >
            {tag.name}
          </span>
        )
      })}
      {hiddenCount > 0 ? (
        <span
          data-testid="shop-card-tags-more"
          className={classNames(TAG_CHIP_CLASS, 'shrink-0')}
        >
          +{hiddenCount}
        </span>
      ) : null}
    </div>
  )
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
    </div>
  )
}

/**
 * shop 主题文章卡片 v5(P18-C4-4 批2,独角数卡 ProductCard 版式 + tags 单行)。
 * - 封面(4/3,group-hover 缩放);
 * - 信息区各行固定高度同构:分类行(h-4)/标题(line-clamp-2 固定两行高)/
 *   tags 单行(h-6,无 tag 占位,C1)——商品卡与普通卡网格不参差;
 * - 底栏(border-t + pt)左侧统一结构:商品卡(有 sku,B1 仅看码)=小标「价格」+
 *   ¥ 大号白色价格(缺价显示「—」)+「价格以结算页为准」极小提示(C5,下方固定
 *   h-3 行),普通卡=小标「发布于」+ 日期 + 空占位行;右侧=「立即购买」闪电小按钮 +
 *   购物车图标按钮(带 sku 已购份数角标,C2/C3;B1 起始终渲染,普通文章点击提示
 *   不可购买)+「→」箭头。
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
  // B1:有 sku 即渲染价格行(价格缺失显示「—」,保持商品式样与等高)
  const showPrice = hasProduct

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
          />

          <div className="flex min-w-0 flex-1 flex-col p-3 md:p-4">
            {/* B1:分类行固定高度,无分类用占位保持行高 */}
            <div className="mb-1 h-4 truncate text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 md:mb-2">
              {category?.name ? `分类 · ${category.name}` : '\u00A0'}
            </div>
            <h2 className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-tight tracking-tight text-neutral-900 dark:text-white md:min-h-[3rem] md:text-base">
              {title}
            </h2>

            {/* C1:Notion tags 单行(无 tag 固定占位,收紧标题下间距) */}
            <CardTagLine tags={tags || []} />

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-neutral-100 pt-2 dark:border-white/10 md:pt-3">
              {showPrice ? (
                <div className="flex min-w-0 flex-col">
                  <span className="hidden text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 md:block">
                    价格
                  </span>
                  {/* B2:¥ 前缀 + 白色价格(亮/暗同白)+ 加粗放大(独角数卡 theme-price-sm);
                      B1:价格缺失(仅存码,查不到/下架)显示「—」占位 */}
                  <span
                    data-testid="shop-card-price"
                    className={classNames(footerValueClass, 'text-white')}
                  >
                    {linkedPrice ? formatPriceLabel(linkedPrice) : '—'}
                  </span>
                  {/* C5:极小价格提示(固定 h-3 行;普通卡同位置空占位保等高) */}
                  <span
                    data-testid="shop-card-price-note"
                    className="mt-0.5 h-3 truncate text-[10px] leading-none text-neutral-400 dark:text-neutral-500"
                  >
                    价格以结算页为准
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
                  <span className="mt-0.5 h-3" aria-hidden="true" />
                </div>
              )}

              <div className="flex shrink-0 items-center gap-2">
                {/* P18C45FIX B1:购买/加购按钮始终渲染(shop 卡片保持商品式样,
                    普通文章也显示,不可购时组件内部提示「当前不可购买」) */}
                <ShopBuyButtons
                  variant="icon"
                  sku={linkedSku}
                  buyUrl={buyUrl}
                  name={title}
                  price={linkedPrice}
                />
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
