import React from 'react'
import { FiCheck, FiShoppingCart, FiZap } from 'react-icons/fi'
import {
  addToCart,
  buildProductUrl,
  getStoreUrl,
  readCart,
} from '@/src/lib/shop/shopCart'
import type { ShopCartItem } from '@/src/lib/shop/shopCart'
import { classNames } from '@/src/lib/util'
import { ShopCartSkuBadge } from './ShopCartSkuBadge'
import { useShopSiteId } from './ShopSiteContext'
import { useShopCartSkuQty } from './useShopCartSkuQty'

/**
 * shop 主题购买动作按钮组(卡片/内页共用;P18-C2 建立,P18-C4-4 批2 C2~C4 强化)。
 *
 * - variant="bar"(文章页商品条,无外层 Link 包裹):「立即购买 / 加入购物车」按钮组。
 * - variant="icon"(卡片底栏,嵌在 PostNavLink 的 <a> 内):「立即购买」闪电小按钮
 *   (C2,购物车按钮左侧,新窗口打开商品链接)+ 加购图标按钮(右上角挂单 SKU
 *   已购份数角标);均 stopPropagation 防触发外层卡片导航。
 * - 加购按钮持久状态(C3):读购物车真实数量(useShopCartSkuQty,localStorage
 *   持久 + 事件实时刷新),已加入时图标钮绿色描边+勾、bar 显示「已加入 ×N」,
 *   不再有 2 秒临时反馈;卡片/内页同组件,状态天然一致。
 * - 重复加购确认(C4):该 sku 已在购物车(qty>0)且再次点击时,先 window.confirm
 *   确认才累加;首次加购不弹。
 * - 立即购买:优先跳人工挂的商品链接(P18-C3 linked_product_url);
 *   未填链接时兜底 {storeUrl}/p/{sku}。
 */

type ShopBuyButtonsProps = {
  /** 商品码(sku);加购/结算用,无则不渲染加购按钮 */
  sku?: string | null
  /** 购物车内展示名(文章标题/商品名) */
  name?: string
  price?: string | null
  /** 立即购买跳转链接(P18-C3 人工挂链;为空时回退 {storeUrl}/p/{sku}) */
  buyUrl?: string | null
  variant?: 'bar' | 'icon'
}

/** C4:重复加购 confirm 文案 */
export function duplicateAddConfirmMessage(currentQty: number): string {
  return `该商品已加入购物车(×${currentQty}),确定继续添加?`
}

/** C4:带重复确认的加购(已在购物车 qty>0 时先 confirm);返回结果供冒烟直测 */
export function addWithDuplicateConfirm(
  siteId: string,
  item: ShopCartItem
): 'added' | 'cancelled' | 'failed' {
  const sku = item.sku.trim()
  if (!sku) return 'failed'
  const existing = readCart(siteId).find((i) => i.sku === sku)
  if (
    existing &&
    existing.qty > 0 &&
    typeof window !== 'undefined' &&
    typeof window.confirm === 'function' &&
    !window.confirm(duplicateAddConfirmMessage(existing.qty))
  ) {
    return 'cancelled'
  }
  return addToCart(siteId, item) != null ? 'added' : 'failed'
}

/** C3:加购按钮文案(持久状态;qty>0 显示已加入份数) */
export function shopCartButtonLabel(qty: number): string {
  return qty > 0 ? `已加入 ×${qty}` : '加入购物车'
}

export function ShopBuyButtons({
  sku,
  name,
  price,
  buyUrl,
  variant = 'icon',
}: ShopBuyButtonsProps) {
  const siteId = useShopSiteId()
  const trimmedSku = (sku || '').trim()
  const trimmedBuyUrl = (buyUrl || '').trim()
  const productUrl =
    trimmedBuyUrl || (trimmedSku ? buildProductUrl(getStoreUrl(), trimmedSku) : '')
  const canBuy = Boolean(productUrl)
  const canAddCart = Boolean(trimmedSku)
  const cartQty = useShopCartSkuQty(siteId, trimmedSku)
  if (!canBuy && !canAddCart) return null
  const isBar = variant === 'bar'
  const added = canAddCart && cartQty > 0

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    addWithDuplicateConfirm(siteId, { sku: trimmedSku, qty: 1, name, price })
  }

  const handleBuyClick = (e: React.MouseEvent) => {
    // 卡片内不使用 <a>,点击时手动新标签打开并阻止外层卡片导航
    e.preventDefault()
    e.stopPropagation()
    window.open(productUrl, '_blank', 'noopener,noreferrer')
  }

  // P18-C4-4 批2:卡片底栏图标形态——闪电「立即购买」(C2,黑底主按钮)+
  // 加购图标按钮;加购持久状态(C3):已加入时绿色描边 + 勾图标,份数角标常驻
  if (!isBar) {
    return (
      <span className="flex items-center gap-1.5">
        {canBuy ? (
          <button
            type="button"
            aria-label="立即购买"
            title="立即购买"
            className="grid h-8 w-8 place-items-center rounded-lg bg-neutral-900 text-white transition-colors duration-200 ease-out hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            onClick={handleBuyClick}
          >
            <FiZap className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        {canAddCart ? (
          <button
            type="button"
            aria-label={added ? `已加入购物车(×${cartQty})` : '加入购物车'}
            className={classNames(
              'relative grid h-8 w-8 place-items-center rounded-lg border transition-colors duration-200 ease-out',
              added
                ? 'border-green-600/60 bg-green-50 text-green-600 dark:border-green-400/50 dark:bg-green-400/10 dark:text-green-400'
                : 'border-neutral-200 text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 dark:border-white/15 dark:text-neutral-300 dark:hover:border-white dark:hover:text-white'
            )}
            onClick={handleAdd}
          >
            {added ? (
              <FiCheck className="h-4 w-4" aria-hidden />
            ) : (
              <FiShoppingCart className="h-4 w-4" aria-hidden />
            )}
            <ShopCartSkuBadge sku={trimmedSku} />
          </button>
        ) : null}
      </span>
    )
  }

  const buyClass =
    'rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white transition-colors duration-200 ease-out hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200'

  const cartClass = classNames(
    'flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-bold transition-colors duration-200 ease-out',
    added
      ? 'border-green-600/50 text-green-700 hover:border-green-600 dark:border-green-400/50 dark:text-green-400 dark:hover:border-green-400'
      : 'border-neutral-300 text-neutral-700 hover:border-neutral-900 dark:border-white/25 dark:text-neutral-200 dark:hover:border-white'
  )

  return (
    <div className="flex items-center gap-3">
      {canBuy ? (
        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buyClass}
          onClick={(e) => e.stopPropagation()}
        >
          立即购买
        </a>
      ) : null}
      {canAddCart ? (
        <button type="button" className={cartClass} onClick={handleAdd}>
          <FiShoppingCart className="h-4 w-4" />
          <span className={added ? 'text-green-600 dark:text-green-400' : undefined}>
            {shopCartButtonLabel(cartQty)}
          </span>
        </button>
      ) : null}
    </div>
  )
}
