import Link from 'next/link'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiMinus, FiPlus, FiShoppingCart, FiTrash2, FiX } from 'react-icons/fi'
import {
  buildCheckoutUrl,
  cartTotalQty,
  clearCart,
  getStoreUrl,
  MAX_CART_QTY,
  parseItemPrice,
  readCart,
  removeCartItem,
  SHOP_CART_CHANGE_EVENT,
  updateCartQty,
  type ShopCartItem,
} from '@/src/lib/shop/shopCart'
import { useShopSiteId } from './ShopSiteContext'

/**
 * P18-C2:shop 主题购物车抽屉;P18-C4-3 C1~C3 修复。
 *
 * - C1:抽屉必须 createPortal 到 document.body——ShopNavbar 的 `<header>` 带
 *   `backdrop-blur-md`,会使 fixed 后代的包含块变成该 56px 导航条;直接渲染在
 *   组件树原位时抽屉被压进导航条(列表区塌陷为 0 高,只露出溢出的合计/结算,
 *   即「合计 4 件但列表空白」的线上症状)。portal 后 fixed 恢复相对视口。
 * - C2:同 SKU 加购在 shopCart.addToCart 内合并数量(封顶 MAX_CART_QTY=99)。
 * - C3:列表行数量 ±(下限 1/上限 99)、删除单条;顶部「清空购物车」两步确认
 *   + 轻提示;空车保留「购物车是空的」+「去商店逛逛」。
 * - C4(批4):面板不透明优雅化(浅色近白 / dark:bg-neutral-900/95 +
 *   border-white/10 rounded-l-2xl),与视口留边 top-3 right-3 bottom-3、
 *   宽 w-[min(430px,92vw)],挂载后 rAF 平滑滑入(motion-reduce 关闭过渡)。
 * - C5(批4):打开时不再锁 document.body 滚动,背景页面可正常滚动,仅遮罩 fixed。
 * - C6(批4):外层遮罩 onClick={onClose} 点击空白关闭;面板内 stopPropagation,
 *   列表/按钮点击不冒泡关闭(叉/Esc 仍可关)。
 * - C7(批4):「去结算」改 <a target="_blank" rel="noopener noreferrer">,新标签
 *   打开 store 结算页,避免浏览器后退键回到贩售机;URL 仍走 buildCheckoutUrl。
 *
 * 数据 = BLOG 侧 localStorage(shop_cart_v1,按 site_id 分组);
 * 「去结算」把条目编码进 URL 跳 {storeUrl}/cart?site=...&items=sku:qty,…
 * (BLOG 域与 store 域 localStorage 不共享,结算状态由 store 侧解析 URL 重建)。
 */

type ShopCartDrawerProps = {
  open: boolean
  onClose: () => void
}

export function ShopCartDrawer({ open, onClose }: ShopCartDrawerProps) {
  const siteId = useShopSiteId()
  const [items, setItems] = useState<ShopCartItem[]>([])
  const [mounted, setMounted] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(() => {
    setItems(readCart(siteId))
  }, [siteId])

  useEffect(() => {
    setMounted(true)
  }, [])

  // 关闭时复位两步确认与提示,避免下次打开残留
  useEffect(() => {
    if (open) return
    setConfirmClear(false)
    setToastMsg('')
  }, [open])

  useEffect(() => {
    if (!open) return
    refresh()
    window.addEventListener(SHOP_CART_CHANGE_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(SHOP_CART_CHANGE_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [open, refresh])

  // Esc 关闭(P18-C4-3 C5:不再锁定 body 滚动——打开抽屉时背景页面可正常滚动,
  // 仅遮罩本身 fixed 覆盖视口)
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  const showToast = useCallback((message: string) => {
    setToastMsg(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 1800)
  }, [])

  const handleQty = useCallback(
    (sku: string, nextQty: number) => {
      updateCartQty(siteId, sku, nextQty)
      refresh()
    },
    [siteId, refresh]
  )

  const handleRemove = useCallback(
    (sku: string) => {
      removeCartItem(siteId, sku)
      refresh()
    },
    [siteId, refresh]
  )

  const handleClear = useCallback(() => {
    if (!confirmClear) {
      setConfirmClear(true)
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirmClear(false)
    clearCart(siteId)
    refresh()
    showToast('购物车已清空')
  }, [confirmClear, siteId, refresh, showToast])

  if (!open || !mounted) return null

  return createPortal(
    <ShopCartDrawerContent
      items={items}
      checkoutUrl={buildCheckoutUrl(getStoreUrl(), siteId, items)}
      confirmClear={confirmClear}
      toastMsg={toastMsg}
      onQty={handleQty}
      onRemove={handleRemove}
      onClear={handleClear}
      onClose={onClose}
    />,
    document.body
  )
}

type ShopCartDrawerContentProps = {
  items: ShopCartItem[]
  checkoutUrl: string
  confirmClear: boolean
  toastMsg: string
  onQty: (sku: string, qty: number) => void
  onRemove: (sku: string) => void
  onClear: () => void
  onClose: () => void
}

/** 抽屉展示层(纯 props 无外部副作用;独立导出供冒烟/测试直接渲染) */
export function ShopCartDrawerContent({
  items,
  checkoutUrl,
  confirmClear,
  toastMsg,
  onQty,
  onRemove,
  onClear,
  onClose,
}: ShopCartDrawerContentProps) {
  const totalQty = cartTotalQty(items)
  const prices = items.map((item) => parseItemPrice(item.price))
  const hasFullPrices = items.length > 0 && prices.every((p) => p != null)
  const totalAmount = hasFullPrices
    ? prices.reduce((sum: number, p, idx) => sum + (p ?? 0) * items[idx].qty, 0)
    : null

  // C4:挂载后下一帧切入 translate-x-0,配合 transition 实现平滑滑入
  // (renderToStaticMarkup/SSR 输出初始态,不影响结构断言)
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label="购物车"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 ease-out"
        onClick={onClose}
      />
      <aside
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-3 right-3 top-3 flex w-[min(430px,92vw)] transform-gpu flex-col overflow-hidden rounded-l-2xl border border-neutral-200/80 bg-white/95 shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none dark:border-white/10 dark:bg-neutral-900/95 ${
          entered ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4 dark:border-white/5">
          <div className="flex min-w-0 items-center gap-2.5">
            <FiShoppingCart
              className="h-5 w-5 shrink-0 text-neutral-700 dark:text-neutral-200"
              aria-hidden
            />
            <h2 className="text-base font-extrabold tracking-tight text-neutral-900 dark:text-white">
              购物车
            </h2>
            {totalQty > 0 ? (
              <span className="shrink-0 rounded-full bg-neutral-900/5 px-2 py-0.5 text-xs font-semibold text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
                共 {totalQty} 件
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            {items.length > 0 ? (
              <button
                type="button"
                aria-label="清空购物车"
                onClick={onClear}
                className={
                  confirmClear
                    ? 'rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600 transition-colors duration-200 ease-out hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20'
                    : 'rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-500 transition-colors duration-200 ease-out hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white'
                }
              >
                {confirmClear ? '确认清空' : '清空'}
              </button>
            ) : null}
            <button
              type="button"
              aria-label="关闭购物车"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors duration-200 ease-out hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <FiX className="h-4 w-4" />
            </button>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-sm text-neutral-500 dark:text-neutral-400">购物车是空的</p>
            <Link
              href="/"
              onClick={onClose}
              className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white transition-colors duration-200 ease-out hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            >
              去商店逛逛
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-neutral-100 overflow-y-auto px-5 dark:divide-white/5">
              {items.map((item) => {
                const price = parseItemPrice(item.price)
                return (
                  <li key={item.sku} className="flex flex-col gap-2 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-neutral-900 dark:text-white">
                          {item.name || item.sku}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-xs text-neutral-500 dark:text-neutral-400">
                          {item.sku}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`删除 ${item.name || item.sku}`}
                        onClick={() => onRemove(item.sku)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors duration-200 ease-out hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                      >
                        <FiTrash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center rounded-lg border border-neutral-200 dark:border-white/15">
                        <button
                          type="button"
                          aria-label="减少数量"
                          disabled={item.qty <= 1}
                          onClick={() => onQty(item.sku, item.qty - 1)}
                          className="flex h-7 w-7 items-center justify-center text-neutral-600 transition-colors duration-200 ease-out hover:text-neutral-900 disabled:opacity-40 dark:text-neutral-300 dark:hover:text-white"
                        >
                          <FiMinus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-8 text-center text-xs font-bold text-neutral-900 dark:text-white">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          aria-label="增加数量"
                          disabled={item.qty >= MAX_CART_QTY}
                          onClick={() => onQty(item.sku, item.qty + 1)}
                          className="flex h-7 w-7 items-center justify-center text-neutral-600 transition-colors duration-200 ease-out hover:text-neutral-900 disabled:opacity-40 dark:text-neutral-300 dark:hover:text-white"
                        >
                          <FiPlus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                        {price != null ? `小计 ¥${(price * item.qty).toFixed(2)}` : `×${item.qty}`}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
            <footer className="border-t border-neutral-100 px-5 py-4 dark:border-white/5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">合计</span>
                <span className="font-extrabold text-neutral-900 dark:text-white">
                  {totalAmount != null
                    ? `¥${totalAmount.toFixed(2)}(共 ${totalQty} 件)`
                    : `共 ${totalQty} 件`}
                </span>
              </div>
              {/* C7:新标签打开 store 结算页,避免结算后后退键落回贩售机/BLOG */}
              <a
                href={checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block w-full rounded-xl bg-green-600 py-2.5 text-center text-sm font-bold text-white transition-colors duration-200 ease-out hover:bg-green-500"
              >
                去结算
              </a>
            </footer>
          </>
        )}

        {toastMsg ? (
          <div
            role="status"
            className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-neutral-900/90 px-4 py-2 text-xs font-semibold text-white shadow-lg dark:bg-white/90 dark:text-black"
          >
            {toastMsg}
          </div>
        ) : null}
      </aside>
    </div>
  )
}
