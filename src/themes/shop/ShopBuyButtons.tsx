import React, { useEffect, useRef, useState } from 'react'
import { FiCheck, FiShoppingCart } from 'react-icons/fi'
import {
  addToCart,
  buildProductUrl,
  getStoreUrl,
} from '@/src/lib/shop/shopCart'
import { ShopCartSkuBadge } from './ShopCartSkuBadge'
import { useShopSiteId } from './ShopSiteContext'

/**
 * shop 主题购买动作按钮组(P18-C2 建立;P18-C4-4B 简化)。
 *
 * - variant="bar"(文章页商品条,无外层 Link 包裹):「立即购买 / 加入购物车」按钮组。
 * - variant="icon"(P18-C4-4B 卡片底栏,嵌在 PostNavLink 的 <a> 内):单个 32px
 *   描边图标按钮——有商品码时为加购(点击加入购物车并短暂显示勾),否则为
 *   立即购买(新标签打开商品链接);均 stopPropagation 防触发外层卡片导航。
 * - 加入购物车:写 localStorage(shop_cart_v1,按 site_id 分组),同 SKU 数量 +1。
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

const ADD_FEEDBACK_MS = 2000

export function ShopBuyButtons({
  sku,
  name,
  price,
  buyUrl,
  variant = 'icon',
}: ShopBuyButtonsProps) {
  const siteId = useShopSiteId()
  const [addedQty, setAddedQty] = useState<number | null>(null)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    }
  }, [])

  const trimmedSku = (sku || '').trim()
  const trimmedBuyUrl = (buyUrl || '').trim()
  const productUrl = trimmedBuyUrl
    || (trimmedSku ? buildProductUrl(getStoreUrl(), trimmedSku) : '')
  const canBuy = Boolean(productUrl)
  const canAddCart = Boolean(trimmedSku)
  if (!canBuy && !canAddCart) return null
  const isBar = variant === 'bar'

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const qty = addToCart(siteId, { sku: trimmedSku, qty: 1, name, price })
    if (qty == null) return
    setAddedQty(qty)
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    feedbackTimer.current = setTimeout(() => setAddedQty(null), ADD_FEEDBACK_MS)
  }

  const handleBuyClick = (e: React.MouseEvent) => {
    // 卡片内不使用 <a>,点击时手动新标签打开并阻止外层卡片导航
    e.preventDefault()
    e.stopPropagation()
    window.open(productUrl, '_blank', 'noopener,noreferrer')
  }

  // P18-C4-4B:卡片底栏图标形态——有商品码=加购,否则=立即购买
  // P18-C4-3 B4:加购按钮右上角挂单 SKU 已购份数角标
  if (!isBar) {
    const added = canAddCart && addedQty != null
    return (
      <button
        type="button"
        aria-label={canAddCart ? '加入购物车' : '立即购买'}
        className="relative grid h-8 w-8 place-items-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors duration-200 ease-out hover:border-neutral-900 hover:text-neutral-900 dark:border-white/15 dark:text-neutral-300 dark:hover:border-white dark:hover:text-white"
        onClick={canAddCart ? handleAdd : handleBuyClick}
      >
        {added ? (
          <FiCheck
            className="h-4 w-4 text-green-600 dark:text-green-400"
            aria-hidden
          />
        ) : (
          <FiShoppingCart className="h-4 w-4" aria-hidden />
        )}
        {canAddCart ? <ShopCartSkuBadge sku={trimmedSku} /> : null}
      </button>
    )
  }

  const buyClass =
    'rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white transition-colors duration-200 ease-out hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200'

  const cartClass =
    'flex items-center gap-2 rounded-xl border border-neutral-300 px-5 py-2.5 text-sm font-bold text-neutral-700 transition-colors duration-200 ease-out hover:border-neutral-900 dark:border-white/25 dark:text-neutral-200 dark:hover:border-white'

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
          {addedQty != null ? (
            <span className="text-green-600 dark:text-green-400">
              已加入 ×{addedQty}
            </span>
          ) : (
            <span>加入购物车</span>
          )}
        </button>
      ) : null}
    </div>
  )
}
