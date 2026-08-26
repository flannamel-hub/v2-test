import { useEffect, useState } from 'react'
import { FiShoppingCart } from 'react-icons/fi'
import {
  cartTotalQty,
  readCart,
  SHOP_CART_CHANGE_EVENT,
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
    return () => {
      window.removeEventListener(SHOP_CART_CHANGE_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [siteId])

  return (
    <>
      <button
        type="button"
        aria-label={`购物车${count ? `,${count} 件商品` : ''}`}
        onClick={() => setOpen(true)}
        className="relative flex h-12 items-center py-3 text-black dark:text-white"
      >
        <FiShoppingCart className="h-[18px] w-[18px]" />
        {count ? (
          <span
            data-testid="shop-cart-badge"
            className="absolute -right-1.5 top-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-green-600 px-1 text-[10px] font-bold leading-none text-white"
          >
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>
      <ShopCartDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}
