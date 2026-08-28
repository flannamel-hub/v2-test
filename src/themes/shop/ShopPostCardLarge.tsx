import { classNames } from '@/src/lib/util'
import { resolveListPostCover } from '@/src/lib/gallery/resolveListPostCover'
import { Post } from '@/src/types/blog'
import React from 'react'
import { PostNavLink } from '@/src/components/navigation/PostNavStallGuard'
import { PostImage } from '@/src/components/card/CardInfo'
import { ShopBuyButtons } from './ShopBuyButtons'

type ShopPostCardLargeProps = {
  post: Post
  galleryCoverSrc?: string | null
}

/**
 * P18-C4-7:shop-v2 首页单列大卡(橱窗式样)。
 * - 上方封面:aspect-video 16:9、object-cover 懒加载(PostImage 复用,亮暗双图),
 *   无封面显示渐变回退(与小卡 CardCover 同语言,仅比例不同);
 * - 下方功能 Bar:圆角卡(白/暗底 + border + 软阴影,与 shop 卡片风格一致)——
 *   行1:分类(「分类 · xxx」)+ Notion tags 单行(复用 CardTagLine,多色可点击);
 *   标题:text-xl/2xl 大号;左下商品名称(linkedProductName,缺失回退标题)+
 *   ¥ 价格(白/大号;无价格「暂无」);右下复用 ShopBuyButtons icon 形态全部逻辑
 *   (角标/已加入×N/不可购居中弹窗/重复加购确认);
 * - 普通文章(无 sku):同样渲染按钮(点击=不可购弹窗),保持橱窗一致性;
 * - 卡片整体 hover:-translate-y-1 + 阴影泛光(与 shop 卡片一致);点击卡片进文章页。
 */
export function ShopPostCardLarge({ post, galleryCoverSrc }: ShopPostCardLargeProps) {
  const { title, slug, category, tags } = post
  const displayCover = resolveListPostCover(post, galleryCoverSrc)
  // 与 ShopPostCard.readProductFields 同语义(P18C45FIX B1/P18C45UI B2):
  // hasProduct 仅看 sku;linkedName 优先商品名称,缺失回退标题
  const linkedSku = post.options?.linkedProductSku?.trim()
  const buyUrl = post.options?.linkedProductUrl?.trim()
  const linkedPrice = post.options?.linkedProductPrice?.trim()
  const linkedName =
    post.options?.linkedProductName?.trim() || post.title?.trim() || ''

  const hasCover = Boolean(displayCover?.light?.src || displayCover?.dark?.src)

  /** P18-C4-4 批2 C2:¥ 前缀统一(去重已带的 ¥/￥,避免 ¥¥) */
  const priceLabel = linkedPrice
    ? `¥${linkedPrice.replace(/^[¥￥]\s*/, '')}`
    : '暂无'

  return (
    <React.StrictMode>
      <PostNavLink href={{ pathname: '/post/[slug]', query: { slug } }} navKey={slug}>
        <div
          data-testid="shop-card-large"
          className="group/card flex w-full cursor-pointer select-none flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition-all duration-300 ease-out hover:-translate-y-1 hover:border-neutral-900/40 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.28)] dark:border-white/15 dark:bg-[#1c1c1e] dark:hover:border-white/40 dark:hover:shadow-[0_12px_32px_-12px_rgba(255,255,255,0.16)]"
        >
          {/* 封面:沿用 Banner 高度阶梯(min-h 200/240/320/420),与 Banner 同比例;与信息区同卡一体 */}
          <div className="relative w-full shrink-0 overflow-hidden bg-neutral-100 dark:bg-neutral-900">
            <div className="min-h-[200px] sm:min-h-[240px] md:min-h-[320px] lg:min-h-[420px]">
              {hasCover ? (
                <PostImage
                  cover={displayCover}
                  alt={title}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 via-neutral-50 to-neutral-200 dark:from-neutral-800 dark:via-neutral-900 dark:to-neutral-800">
                  <span className="select-none text-sm font-semibold uppercase tracking-widest text-neutral-300 dark:text-neutral-600">
                    {category?.name || title.slice(0, 1) || 'Post'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 信息区:单行(标题+价格+按钮),集成大卡底部 */}
          <div className="flex min-w-0 flex-col p-5 md:p-6">
            {/* 单行:左(标题 · 价格)右(立即购买+购物车)——价格在标题旁,按钮组靠右 */}
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <h2 className="min-w-0 truncate text-lg font-bold leading-snug tracking-tight text-neutral-900 dark:text-white md:text-xl">
                  {title}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ShopBuyButtons
                  variant="icon"
                  size="lg"
                  sku={linkedSku}
                  buyUrl={buyUrl}
                  name={linkedName || title}
                  price={linkedPrice}
                />
              </div>
            </div>
          </div>
        </div>
      </PostNavLink>
    </React.StrictMode>
  )
}
