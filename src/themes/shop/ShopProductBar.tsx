import { FiShoppingBag } from 'react-icons/fi'
import { Post } from '@/src/types/blog'
import { ShopBuyButtons } from './ShopBuyButtons'

/**
 * shop 主题文章页页内购买组件(P18-C4-2.4 强化;P18C45FIX B1 调整)。
 * 读取 Notion Step7 三字段(linked_product_sku / linked_product_url /
 * linked_product_price,文章输出 pipeline 已映射到 post.options),
 * 渲染于封面/图库区域下方:商品码 chip + 价格 + 「立即购买 / 加入购物车」。
 * - hasProduct 仅看 sku 非空(B1):查不到商品/已下架时 sku 保留、url/price 清空,
 *   本条仍渲染,价格缺失显示「—」+「价格以结算页为准」,购买/加购点击提示不可购买;
 * - 购买仅跳 buyUrl(P18-C4-5 联动写入),加购需有 sku;
 * - 三字段全空(纯普通文章)时整块不渲染(内页保持标准样式)。
 */
export function ShopProductBar({ post }: { post: Post }) {
  const linkedSku = post.options?.linkedProductSku?.trim()
  const buyUrl = post.options?.linkedProductUrl?.trim()
  const linkedPrice = post.options?.linkedProductPrice?.trim()
  if (!linkedSku && !buyUrl && !linkedPrice) return null
  // B1:商品区判定仅看 sku 非空(不再要求 url/price)
  const hasProduct = Boolean(linkedSku)

  return (
    <aside
      data-shop-linked-sku={linkedSku || undefined}
      className="my-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-2xl border border-green-600/20 bg-green-50/70 px-5 py-4 dark:border-green-400/20 dark:bg-green-400/5"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green-600/10 text-green-600 dark:text-green-400"
          aria-hidden
        >
          <FiShoppingBag className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-green-700 dark:text-green-400">
            关联商品
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {linkedSku ? (
              <span className="truncate rounded-md border border-neutral-200 bg-white px-2 py-0.5 font-mono text-xs text-neutral-600 dark:border-white/10 dark:bg-black/30 dark:text-neutral-300">
                商品码 {linkedSku}
              </span>
            ) : null}
            {linkedPrice ? (
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-lg font-extrabold leading-none text-rose-600 dark:text-rose-400">
                  {linkedPrice}
                </span>
                {/* C5(P18-C4-4 批2):极小价格提示,与首页卡片同步 */}
                <span
                  data-testid="shop-bar-price-note"
                  className="text-[10px] leading-none text-neutral-400 dark:text-neutral-500"
                >
                  价格以结算页为准
                </span>
              </span>
            ) : hasProduct ? (
              /* B1:有 sku 无价格(查不到/下架仅存码)→ 占位「—」+提示,保持商品式样 */
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                <span
                  data-testid="shop-bar-price-placeholder"
                  className="text-lg font-extrabold leading-none text-neutral-400 dark:text-neutral-500"
                >
                  —
                </span>
                <span
                  data-testid="shop-bar-price-note"
                  className="text-[10px] leading-none text-neutral-400 dark:text-neutral-500"
                >
                  价格以结算页为准
                </span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="shrink-0">
        <ShopBuyButtons
          sku={linkedSku}
          buyUrl={buyUrl}
          name={post.title}
          price={linkedPrice}
          variant="bar"
        />
      </div>
    </aside>
  )
}
