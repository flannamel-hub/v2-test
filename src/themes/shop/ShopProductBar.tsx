import { Post } from '@/src/types/blog'
import { ShopBuyButtons } from './ShopBuyButtons'

/**
 * shop 主题文章页关联商品条。
 * 读取 Notion 属性 linked_product_sku(文章输出 pipeline 已映射到
 * post.options.linkedProductSku);右侧渲染「立即购买 / 加入购物车」按钮
 * (P18-C2:购买跳 {storeUrl}/p/{sku},加购写本地购物车)。
 */
export function ShopProductBar({ post }: { post: Post }) {
  const linkedSku = post.options?.linkedProductSku?.trim()
  if (!linkedSku) return null

  return (
    <aside
      data-shop-linked-sku={linkedSku}
      className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-green-600/20 bg-green-50 px-5 py-4 dark:border-green-400/20 dark:bg-green-400/5"
    >
      <div className="min-w-0">
        <p className="text-xs font-bold text-green-700 dark:text-green-400">
          关联商品
        </p>
        <p className="mt-1 truncate text-sm font-mono text-neutral-700 dark:text-neutral-200">
          {linkedSku}
        </p>
      </div>
      <div className="shrink-0">
        <ShopBuyButtons sku={linkedSku} name={post.title} variant="bar" />
      </div>
    </aside>
  )
}
