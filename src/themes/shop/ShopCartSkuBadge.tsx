import { useShopCartSkuQty } from './useShopCartSkuQty'
import { useShopSiteId } from './ShopSiteContext'

/**
 * P18-C4-3 B4:商品卡购物车按钮上的单 SKU 已购份数角标。
 * 数据源 useShopCartSkuQty(readCart 按 sku 聚合,localStorage 持久,
 * SHOP_CART_CHANGE_EVENT + storage 实时刷新;P18-C4-4 批2 起与
 * ShopBuyButtons 持久状态同源)。数量在客户端挂载后读取(SSR/首帧
 * 不渲染,避免 hydration 不一致);购物车无该 sku(或数量为 0)时不渲染。
 */
export function ShopCartSkuBadge({ sku }: { sku: string }) {
  const siteId = useShopSiteId()
  const qty = useShopCartSkuQty(siteId, sku)

  if (!qty) return null
  return (
    <span
      data-testid="shop-cart-sku-badge"
      aria-label={`已加入 ${qty} 份`}
      className="absolute -right-1 -top-1 z-10 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-neutral-900 px-1 py-0.5 text-[10px] font-bold leading-none text-white dark:bg-white dark:text-black"
    >
      {qty > 99 ? '99+' : qty}
    </span>
  )
}
