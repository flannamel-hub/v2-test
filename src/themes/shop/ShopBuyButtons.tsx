import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiCheck, FiShoppingCart } from 'react-icons/fi'
import {
  addToCart,
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
 * - variant="icon"(卡片底栏,嵌在 PostNavLink 的 <a> 内):「立即购买」纯文字按钮
 *   (P18C45UI B8:去图标,黑底小号圆角,新窗口打开商品链接)+ 加购图标按钮
 *   (右上角挂单 SKU 已购份数角标);均 stopPropagation 防触发外层卡片导航。
 * - 加购按钮持久状态(C3):读购物车真实数量(useShopCartSkuQty,localStorage
 *   持久 + 事件实时刷新),已加入时图标钮绿色描边+勾、bar 显示「已加入 ×N」,
 *   不再有 2 秒临时反馈;卡片/内页同组件,状态天然一致。
 * - 重复加购确认(C4):该 sku 已在购物车(qty>0)且再次点击时,先 window.confirm
 *   确认才累加;首次加购不弹。
 * - 立即购买:仅跳 buyUrl(P18-C4-5 保存联动写入 {STORE}/p/{sku} 或人工挂链);
 *   P18C45FIX B1:无 buyUrl(含仅存 sku 未查到商品)点击提示「当前不可购买」,
 *   不再用 sku 兜底拼 {storeUrl}/p/{sku}(url 为空即表示当前无有效购买信息)。
 * - P18C45UI B2:不可购买提示由 window.alert 改为**页内轻提示 toast**——
 *   createPortal 挂 document.body(卡片外壳 hover:-translate-y-1 是 transform,
 *   直接原位渲染 fixed 会被压进卡片,参照购物车抽屉 C1 教训),底部居中小条,
 *   2 秒自动消失,深浅色双适配;前台不引入 toast 库。
 */

type ShopBuyButtonsProps = {
  /** 商品码(sku);加购/结算用,无则加购点击提示不可购买 */
  sku?: string | null
  /** 购物车内展示名(商品名/文章标题) */
  name?: string
  price?: string | null
  /** 立即购买跳转链接(P18-C4-5 联动写入/人工挂链;为空时点击提示不可购买) */
  buyUrl?: string | null
  variant?: 'bar' | 'icon'
}

/** P18C45FIX B1 / P18C45UI B2:不可购买提示文案(页内 toast,不再 window.alert) */
export const NOT_PURCHASABLE_MESSAGE = '当前不可购买'

/** P18C45UI B2:不可购买 toast 显示时长(ms) */
export const NOT_PURCHASABLE_TOAST_MS = 2000

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
  // P18C45FIX B1:购买只认 buyUrl,无 url 即不可购(不再用 sku 兜底拼链接)
  const productUrl = trimmedBuyUrl
  const canBuy = Boolean(productUrl)
  const canAddCart = Boolean(trimmedSku)
  const cartQty = useShopCartSkuQty(siteId, trimmedSku)
  // B1:按钮始终渲染(shop 卡片保持商品式样,普通文章也显示,点击提示不可购买)
  const isBar = variant === 'bar'
  const added = canAddCart && cartQty > 0

  // P18C45UI B2:页内不可购买 toast(portal 到 body,2s 自动消失)
  const [toastVisible, setToastVisible] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    setPortalReady(true)
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])
  const notifyNotPurchasable = () => {
    if (typeof window === 'undefined') return
    setToastVisible(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(
      () => setToastVisible(false),
      NOT_PURCHASABLE_TOAST_MS
    )
  }
  const toastNode =
    portalReady && toastVisible
      ? createPortal(
          <div
            role="status"
            data-testid="shop-not-purchasable-toast"
            className="pointer-events-none fixed bottom-10 left-1/2 z-[70] -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900/90 px-4 py-2 text-xs font-semibold text-white shadow-lg dark:bg-white/90 dark:text-black"
          >
            {NOT_PURCHASABLE_MESSAGE}
          </div>,
          document.body
        )
      : null

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!canAddCart) {
      notifyNotPurchasable()
      return
    }
    addWithDuplicateConfirm(siteId, { sku: trimmedSku, qty: 1, name, price })
  }

  const handleBuyClick = (e: React.MouseEvent) => {
    // 卡片内不使用 <a>,点击时手动新标签打开并阻止外层卡片导航
    e.preventDefault()
    e.stopPropagation()
    if (!canBuy) {
      notifyNotPurchasable()
      return
    }
    window.open(productUrl, '_blank', 'noopener,noreferrer')
  }

  // P18-C4-4 批2 + P18C45FIX 批3 + P18C45UI 批1(B8):卡片底栏形态——
  // 「立即购买」纯文字按钮(去图标,黑底小号圆角)+ 加购图标按钮(份数角标);
  // 加购持久状态(C3):已加入时绿色描边 + 勾图标,份数角标常驻;
  // P18C45FIX B1:两钮均始终渲染,不可购时点击提示
  if (!isBar) {
    return (
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="立即购买"
          title="立即购买"
          className="flex h-8 items-center rounded-lg bg-neutral-900 px-2.5 text-xs font-bold text-white transition-colors duration-200 ease-out hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
          onClick={handleBuyClick}
        >
          立即购买
        </button>
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
        {toastNode}
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
      ) : (
        <button type="button" className={buyClass} onClick={handleBuyClick}>
          立即购买
        </button>
      )}
      <button type="button" className={cartClass} onClick={handleAdd}>
        <FiShoppingCart className="h-4 w-4" />
        <span className={added ? 'text-green-600 dark:text-green-400' : undefined}>
          {shopCartButtonLabel(cartQty)}
        </span>
      </button>
      {toastNode}
    </div>
  )
}
