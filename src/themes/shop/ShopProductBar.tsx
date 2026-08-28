import { FiShoppingBag } from 'react-icons/fi'
import { Post } from '@/src/types/blog'
import { ShopBuyButtons } from './ShopBuyButtons'

/**
 * shop 主题文章页页内购买组件(P18-C4-2.4 强化;P18C45FIX B1 / P18C45UI B2 调整)。
 * 读取 Notion Step7 字段(linked_product_sku / linked_product_url /
 * linked_product_price / linked_product_name,文章输出 pipeline 已映射到 post.options),
 * 渲染于封面/图库区域下方:商品名称(P18C45UI B2,缺失回退文章标题)+ 价格 +
 * 「立即购买 / 加入购物车」。
 * - hasProduct 仅看 sku 非空(B1):查不到商品/已下架时 sku 保留、url/price/name 清空,
 *   本条仍渲染,价格缺失显示「—」占位(P18C45UI 批3:「价格以结算页为准」提示已删),
 *   购买/加购点击弹「当前不可购买」页内弹窗;
 * - 价格颜色统一白色(P18C45UI 批3,与卡片一致);
 * - P18C45UI B2:不再展示「商品码 SKU」chip,优先显示商品名称(linkedProductName,
 *   缺失回退 post.title);
 * - 购买仅跳 buyUrl(P18-C4-5 联动写入),加购需有 sku;
 * - 四字段全空(纯普通文章)时整块不渲染(内页保持标准样式)。
 */
export function ShopProductBar({ post }: { post: Post }) {
  const linkedSku = post.options?.linkedProductSku?.trim()
  const buyUrl = post.options?.linkedProductUrl?.trim()
  const linkedPrice = post.options?.linkedProductPrice?.trim()
  // P18C45UI B2:优先商品名称,缺失回退文章标题
  const productName =
    post.options?.linkedProductName?.trim() || post.title?.trim() || ''
  if (!linkedSku && !buyUrl && !linkedPrice) return null
  // B1:商品区判定仅看 sku 非空(不再要求 url/price)
  const hasProduct = Boolean(linkedSku)

  return (
    <aside
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              data-testid="shop-bar-product-name"
              title={productName}
              className="min-w-0 max-w-full truncate text-sm font-bold text-neutral-900 dark:text-white"
            >
              {productName || '商品'}
            </span>
            {linkedPrice ? (
              /* P18C45UI 批3:价格统一白色;「价格以结算页为准」提示小字已删除 */
              <span
                data-testid="shop-bar-price"
                className="text-lg font-extrabold leading-none text-white dark:text-white"
              >
                ¥{linkedPrice.trim().replace(/^[¥￥]\s*/, '')}
              </span>
            ) : hasProduct ? (
              /* B1:有 sku 无价格(查不到/下架仅存码)→ 占位「—」,保持商品式样 */
              <span
                data-testid="shop-bar-price-placeholder"
                className="text-lg font-extrabold leading-none text-neutral-400 dark:text-neutral-500"
              >
                —
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="shrink-0">
        <ShopBuyButtons
          sku={linkedSku}
          buyUrl={buyUrl}
          name={productName || post.title}
          price={linkedPrice}
          variant="bar"
        />
      </div>
    </aside>
  )
}
