import React, { useEffect, useRef, useState } from 'react'
import { FiShoppingCart } from 'react-icons/fi'
import {
  addToCart,
  buildProductUrl,
  getStoreUrl,
} from '@/src/lib/shop/shopCart'
import { useShopSiteId } from './ShopSiteContext'

/**
 * P18-C2:shop 主题「立即购买 / 加入购物车」按钮组。
 *
 * - 立即购买:优先跳人工挂的商品链接(P18-C3 linked_product_url);
 *   未填链接时兜底 {storeUrl}/p/{sku}。variant="bar"(文章页商品条,无外层
 *   Link 包裹)渲染真 <a>;variant="card"(卡片,嵌在 PostNavLink/next-link
 *   的 <a> 内)为避免 a 嵌套改用 button + window.open 新标签。
 * - 加入购物车:写 localStorage(shop_cart_v1,按 site_id 分组),同 SKU
 *   数量 +1;按钮短暂显示「已加入 ×N」反馈;点击须阻止卡片跳转冒泡;
 *   无商品码(sku)时不渲染加购按钮。
 * - 两类按钮均 stopPropagation,防触发外层文章卡导航。
 */

type ShopBuyButtonsProps = {
  /** 商品码(sku);加购/结算用,无则不渲染加购按钮 */
  sku?: string | null
  /** 购物车内展示名(文章标题/商品名) */
  name?: string
  price?: string | null
  /** 立即购买跳转链接(P18-C3 人工挂链;为空时回退 {storeUrl}/p/{sku}) */
  buyUrl?: string | null
  variant?: 'card' | 'bar'
}

const ADD_FEEDBACK_MS = 2000

export function ShopBuyButtons({
  sku,
  name,
  price,
  buyUrl,
  variant = 'card',
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
  const isCard = variant === 'card'

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

  const buyClass = isCard
    ? 'flex-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-bold text-white transition-colors duration-200 ease-out hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200'
    : 'rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white transition-colors duration-200 ease-out hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200'

  const cartClass = isCard
    ? 'flex items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-bold text-neutral-700 transition-colors duration-200 ease-out hover:border-neutral-900 dark:border-white/25 dark:text-neutral-200 dark:hover:border-white'
    : 'flex items-center gap-2 rounded-xl border border-neutral-300 px-5 py-2.5 text-sm font-bold text-neutral-700 transition-colors duration-200 ease-out hover:border-neutral-900 dark:border-white/25 dark:text-neutral-200 dark:hover:border-white'

  return (
    <div className={isCard ? 'flex w-full items-center gap-2' : 'flex items-center gap-3'}>
      {canBuy ? (
        isCard ? (
          <button type="button" className={buyClass} onClick={handleBuyClick}>
            立即购买
          </button>
        ) : (
          <a
            href={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buyClass}
            onClick={(e) => e.stopPropagation()}
          >
            立即购买
          </a>
        )
      ) : null}
      {canAddCart ? (
        <button type="button" className={cartClass} onClick={handleAdd}>
          <FiShoppingCart className={isCard ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          {addedQty != null ? (
            <span className="text-green-600 dark:text-green-400">已加入 ×{addedQty}</span>
          ) : (
            <span>加入购物车</span>
          )}
        </button>
      ) : null}
    </div>
  )
}
