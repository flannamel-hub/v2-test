import { useEffect, useState } from 'react'
import { FiShoppingCart } from 'react-icons/fi'
import {
  cartTotalQty,
  readCart,
  SHOP_CART_CHANGE_EVENT,
  SHOP_CART_OPEN_EVENT,
} from '@/src/lib/shop/shopCart'
import { ShopCartDrawer } from './ShopCartDrawer'
import { useShopSiteId } from './ShopSiteContext'

/**
 * P18-C2:导航栏购物车入口(徽标 + 抽屉)。
 * 徽标数量 = 当前站点购物车总件数(localStorage);监听购物车变更事件实时刷新。
 * 数量在客户端挂载后读取(SSR/首帧不显示,避免 hydration 不一致)。
 */
export function ShopCartButton() {
  const siteId = useShopSiteId()
  const [count, setCount] = useState<number | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const refresh = () => setCount(cartTotalQty(readCart(siteId)))
    refresh()
    window.addEventListener(SHOP_CART_CHANGE_EVENT, refresh)
    window.addEventListener('storage', refresh)
    const openHandler = () => setOpen(true)
    window.addEventListener(SHOP_CART_OPEN_EVENT, openHandler)
    return () => {
      window.removeEventListener(SHOP_CART_CHANGE_EVENT, refresh)
      window.removeEventListener('storage', refresh)
      window.removeEventListener(SHOP_CART_OPEN_EVENT, openHandler)
    }
  }, [siteId])

  return (
    <>
      <button
        type="button"
        aria-label={`购物车${count ? `,${count} 件商品` : ''}`}
        onClick={() => setOpen(true)}
        className="relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-900/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <FiShoppingCart className="h-4 w-4 shrink-0" aria-hidden />
        <span className="hidden sm:inline">购物车</span>
        {count ? (
          <span
            data-testid="shop-cart-badge"
            className="absolute -right-1 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-600 px-1 py-0.5 text-[10px] font-bold leading-none text-white dark:bg-red-600 dark:text-white"
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>
      <ShopCartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}
