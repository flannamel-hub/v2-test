import { useEffect, useState } from 'react'
import { readCart, SHOP_CART_CHANGE_EVENT } from '@/src/lib/shop/shopCart'
import { useShopSiteId } from './ShopSiteContext'

/**
 * P18-C4-3 B4:商品卡购物车按钮上的单 SKU 已购份数角标。
 * 数据源 readCart(siteId) 按 sku 聚合(localStorage 持久,刷新/跨页保持);
 * 监听 SHOP_CART_CHANGE_EVENT + storage 事件实时刷新。
 * 数量在客户端挂载后读取(SSR/首帧不渲染,避免 hydration 不一致);
 * 购物车无该 sku(或数量为 0)时不渲染。
 */
export function ShopCartSkuBadge({ sku }: { sku: string }) {
  const siteId = useShopSiteId()
  const [qty, setQty] = useState<number | null>(null)

  useEffect(() => {
    const trimmedSku = sku.trim()
    if (!trimmedSku) return
    const refresh = () => {
      const item = readCart(siteId).find((i) => i.sku === trimmedSku)
      setQty(item && item.qty > 0 ? item.qty : 0)
    }
    refresh()
    window.addEventListener(SHOP_CART_CHANGE_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(SHOP_CART_CHANGE_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [siteId, sku])

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
