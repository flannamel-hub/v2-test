import { Post } from '@/src/types/blog'
import { ShopBuyButtons } from './ShopBuyButtons'

/**
 * shop 主题文章页关联商品条。
 * 读取 Notion 属性 linked_product_sku / linked_product_url /
 * linked_product_price(文章输出 pipeline 已映射到 post.options);
 * 右侧渲染「立即购买 / 加入购物车」按钮(P18-C3:购买优先人工挂的
 * linked_product_url,未填时兜底 {storeUrl}/p/{sku};加购按 sku 结算)。
 * 三个字段全空时整条不渲染。
 */
export function ShopProductBar({ post }: { post: Post }) {
  const linkedSku = post.options?.linkedProductSku?.trim()
  const buyUrl = post.options?.linkedProductUrl?.trim()
  const linkedPrice = post.options?.linkedProductPrice?.trim()
  if (!linkedSku && !buyUrl && !linkedPrice) return null

  return (
    <aside
      data-shop-linked-sku={linkedSku || undefined}
      className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-green-600/20 bg-green-50 px-5 py-4 dark:border-green-400/20 dark:bg-green-400/5"
    >
      <div className="min-w-0">
        <p className="text-xs font-bold text-green-700 dark:text-green-400">
          关联商品
        </p>
        {linkedSku ? (
          <p className="mt-1 truncate text-sm font-mono text-neutral-700 dark:text-neutral-200">
            商品码:{linkedSku}
          </p>
        ) : null}
      </div>
      {linkedPrice ? (
        <p className="shrink-0 text-lg font-extrabold text-rose-600 dark:text-rose-400">
          {linkedPrice}
        </p>
      ) : null}
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
