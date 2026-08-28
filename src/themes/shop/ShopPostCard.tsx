import { FiArrowRight, FiChevronRight } from 'react-icons/fi'
import { useRouter } from 'next/router'
import { classNames } from '@/src/lib/util'
import { resolveListPostCover } from '@/src/lib/gallery/resolveListPostCover'
import { Post } from '@/src/types/blog'
import React, { useEffect, useRef, useState } from 'react'
import { PostNavLink } from '@/src/components/navigation/PostNavStallGuard'
import { PostImage } from '@/src/components/card/CardInfo'
import { ShopBuyButtons } from './ShopBuyButtons'

type ShopPostCardProps = {
  post: Post
  galleryCoverSrc?: string | null
}

/**
 * P18C45UI 批1(B9):默认仅细描边(无阴影);hover 描边提亮 + 发光阴影
 * (原默认带 shadow-card 泛光、悬停才出现描边强化的状态已互换)。
 */
const CARD_SHELL =
  'group relative flex h-full cursor-pointer select-none flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition-all duration-300 ease-out hover:-translate-y-1 hover:border-neutral-900/40 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.28)] dark:border-white/10 dark:bg-[#1c1c1e] dark:hover:border-white/40 dark:hover:shadow-[0_12px_32px_-12px_rgba(255,255,255,0.16)]'

/**
 * C1:标题下 Notion tags 单行 chip;B3-④ 升级为多色可点击——
 * 按名 hash 取色(indigo/emerald/amber/sky/rose/neutral 浅底色 + 暗色 15% 透明底),
 * text-xs + px-2 放大,单击跳 /tag/{id}(同窗,stopPropagation 防触发卡片导航)。
 */
const TAG_CHIP_BASE =
  'min-w-0 max-w-full cursor-pointer truncate rounded-md px-2 py-0.5 text-xs font-medium leading-5 transition-colors duration-150 ease-out'

/** B3-④:tag 预设色板(亮色浅底/暗色透明底,hover 提亮) */
const TAG_COLOR_PALETTE: string[] = [
  'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25',
  'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25',
  'bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25',
  'bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:hover:bg-sky-500/25',
  'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25',
  'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-white/10 dark:text-neutral-400 dark:hover:bg-white/20',
]

/** B3-④:tag 名 hash → 色板下标(纯函数,供冒烟直测;同名同色) */
export function tagColorIndex(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % TAG_COLOR_PALETTE.length
}

/** B3-④:tag 跳转链接(/tag 路由按 tag id 匹配,encodeURIComponent 编码) */
export function tagHref(tag: { id?: string; name: string }): string {
  return `/tag/${encodeURIComponent(tag.id || tag.name)}`
}

/**
 * 读取 Step7 字段;P18C45FIX B1:hasProduct 仅看 sku 非空
 * (查不到/下架仅存码也算商品文章,价格缺失显示「—」;url/price 不再参与判定);
 * P18C45UI B2:linkedName 优先商品名称,缺失回退标题(加购条目名与内页一致);
 * P18C45UI B10:卡片底栏价格位一律渲染价格/「暂无」,不再依赖 hasProduct 分支
 */
function readProductFields(post: Post) {
  const linkedSku = post.options?.linkedProductSku?.trim()
  const buyUrl = post.options?.linkedProductUrl?.trim()
  const linkedPrice = post.options?.linkedProductPrice?.trim()
  const linkedName =
    post.options?.linkedProductName?.trim() || post.title?.trim() || ''
  return {
    linkedSku,
    buyUrl,
    linkedPrice,
    linkedName,
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
 * - B3-④:chip 多色(tagColorIndex 按名 hash)+ 放大(text-xs/px-2)+
 *   可点击(单击同窗跳 /tag/{id},preventDefault+stopPropagation 防外层卡片导航);
 * - 与独角数卡区分:独角数卡该位置是系统状态徽章(游客可购/人工交付等),
 *   我们这里是站长的 Notion tags,仅展示位置相同、语义不同,勿混。
 */
function CardTagLine({ tags }: { tags: { id?: string; name: string }[] }) {
  const router = useRouter()
  const rowRef = useRef<HTMLDivElement | null>(null)
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([])
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
    // 无 tag 固定占一行高度,保证卡片等高;B4:间距压缩为 mt-1
    return (
      <div data-testid="shop-card-tags" aria-hidden="true" className="mt-1 h-6" />
    )
  }
  const hiddenCount =
    visibleCount != null && visibleCount < tags.length ? tags.length - visibleCount : 0
  return (
    <div
      data-testid="shop-card-tags"
      className="mt-1 flex h-6 items-center gap-1 overflow-hidden"
    >
      {tags.map((tag, i) => {
        const hidden = visibleCount != null && i >= visibleCount
        return (
          <button
            key={tag.id || tag.name}
            type="button"
            aria-label={`按标签筛选 ${tag.name}`}
            ref={(el) => {
              chipRefs.current[i] = el
            }}
            onClick={(e) => {
              // 同窗跳转 /tag/{id};阻止触发外层 PostNavLink 卡片导航
              e.preventDefault()
              e.stopPropagation()
              router.push(tagHref(tag))
            }}
            className={classNames(
              TAG_CHIP_BASE,
              TAG_COLOR_PALETTE[tagColorIndex(tag.name)],
              hidden ? 'absolute invisible' : 'shrink-0'
            )}
          >
            {tag.name}
          </button>
        )
      })}
      {hiddenCount > 0 ? (
        <span
          data-testid="shop-card-tags-more"
          className="min-w-0 max-w-full shrink-0 truncate rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium leading-5 text-neutral-500 dark:bg-white/10 dark:text-neutral-400"
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
}: {
  displayCover: Post['cover']
  title: string
  categoryName?: string
}) {
  const hasCover = Boolean(displayCover?.light?.src || displayCover?.dark?.src)
  return (
    <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-neutral-100 dark:bg-neutral-900">
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
 * shop 主题文章卡片 v6(P18C45UI 批1,独角数卡 ProductCard 版式精简)。
 * - 封面(4/3,group-hover 缩放);信息区各行固定高度同构:分类行(h-4)/
 *   标题(line-clamp-2 固定两行高)/tags 单行(h-6,无 tag 占位;B4 间距压缩 mt-1);
 *   摘要位已取消(B5),无 tags 无摘要时 tags 行保留一行高度占位,卡片等高不变;
 * - 底栏(border-t + pt)左侧一律价格位(B10):小标「价格」+ ¥ 大号价格
 *   (P18C45UI 批3:白色,与内页商品条统一;无价格/未关联商品显示「暂无」中性占位),
 *   不再显示发布日期;「价格以结算页为准」提示已移除(B7);
 * - 右侧=「立即购买」纯文字按钮(B8:去图标)+ 购物车图标按钮(带 sku 已购
 *   份数角标,始终渲染,不可购时组件内部页内 toast 提示)+ 桌面端详情箭头
 *   (B6:「阅读→」文字已移除,仅保留箭头,同独角数卡)。
 * 网格视图单一形态(P18C45UI A2:列表视图与 variant prop 已删除)。
 */
export function ShopPostCard({ post, galleryCoverSrc }: ShopPostCardProps) {
  const { title, slug, category, tags } = post
  const displayCover = resolveListPostCover(post, galleryCoverSrc)
  const { linkedSku, buyUrl, linkedPrice, linkedName } = readProductFields(post)

  const detailArrowClass =
    'hidden items-center gap-1 text-xs font-bold uppercase text-neutral-500 transition-colors duration-200 ease-out group-hover:text-neutral-900 dark:text-neutral-400 dark:group-hover:text-white md:flex'

  // B10:底栏值行同字号/字重/行高,保证商品卡与普通卡底栏等高
  const footerValueClass =
    'truncate text-base font-bold leading-tight tracking-tight md:text-lg'

  return (
    <React.StrictMode>
      <PostNavLink href={{ pathname: '/post/[slug]', query: { slug } }} navKey={slug}>
        <div className={classNames(CARD_SHELL)}>
          <CardCover
            displayCover={displayCover}
            title={title}
            categoryName={category?.name}
          />

          <div className="flex min-w-0 flex-1 flex-col p-3 md:p-4">
            {/* 分类行固定高度,无分类用占位保持行高 */}
            <div className="mb-1 h-4 truncate text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 md:mb-2">
              {category?.name ? `分类 · ${category.name}` : '\u00A0'}
            </div>
            <h2 className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-tight tracking-tight text-neutral-900 dark:text-white md:min-h-[3rem] md:text-base">
              {title}
            </h2>

            {/* B4:Notion tags 单行(间距压缩 mt-1;无 tag 固定占位保等高) */}
            <CardTagLine tags={tags || []} />

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-neutral-100 pt-2 dark:border-white/10 md:pt-3">
              {/* B10:底部价格位一律显示——有价显示 ¥ 价格(P18C45UI 批3:白色,
                  与内页商品条统一);无价/未关联商品显示「暂无」中性占位;
                  不显示发布日期;B7:价格提示已移除 */}
              <div className="flex min-w-0 flex-col">
                <span className="hidden text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400 md:block">
                  价格
                </span>
                <span
                  data-testid="shop-card-price"
                  className={classNames(
                    footerValueClass,
                    linkedPrice
                      ? 'text-white dark:text-white'
                      : 'text-neutral-400 dark:text-neutral-500'
                  )}
                >
                  {linkedPrice ? formatPriceLabel(linkedPrice) : '暂无'}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {/* P18C45FIX B1:购买/加购按钮始终渲染(shop 卡片保持商品式样,
                    普通文章也显示,不可购时组件内部提示「当前不可购买」) */}
                <ShopBuyButtons
                  variant="icon"
                  sku={linkedSku}
                  buyUrl={buyUrl}
                  name={linkedName || title}
                  price={linkedPrice}
                />
                {/* B6:「阅读→」已移除,保留桌面端详情箭头(同独角数卡) */}
                <span className={detailArrowClass}>
                  <FiArrowRight
                    className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-1"
                    aria-hidden
                  />
                </span>
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
