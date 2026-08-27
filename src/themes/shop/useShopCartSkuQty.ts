import { useEffect, useState } from 'react'
import { readCart, SHOP_CART_CHANGE_EVENT } from '@/src/lib/shop/shopCart'

/**
 * P18-C4-4 批2 C3:单 SKU 在购物车中的持久数量(0=未加购)。
 * 数据源 readCart(siteId) 按 sku 聚合(localStorage 持久,刷新/跨页保持);
 * 监听 SHOP_CART_CHANGE_EVENT + storage 事件实时刷新(加购/抽屉增删/跨标签页)。
 * SSR/首帧返回 0(避免 hydration 不一致),挂载后读取真实数量。
 * ShopBuyButtons 与 ShopCartSkuBadge 共用,保证卡片/内页状态一致。
 */
export function useShopCartSkuQty(siteId: string, sku: string): number {
  const [qty, setQty] = useState(0)

  useEffect(() => {
    const trimmedSku = (sku || '').trim()
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

  return qty
}
