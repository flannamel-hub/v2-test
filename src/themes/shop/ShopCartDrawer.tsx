import Link from 'next/link'
import React, { useCallback, useEffect, useState } from 'react'
import { FiMinus, FiPlus, FiTrash2, FiX } from 'react-icons/fi'
import {
  buildCheckoutUrl,
  cartTotalQty,
  getStoreUrl,
  parseItemPrice,
  readCart,
  removeCartItem,
  SHOP_CART_CHANGE_EVENT,
  updateCartQty,
  type ShopCartItem,
} from '@/src/lib/shop/shopCart'
import { useShopSiteId } from './ShopSiteContext'

/**
 * P18-C2:shop 主题购物车抽屉。
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

  const refresh = useCallback(() => {
    setItems(readCart(siteId))
  }, [siteId])

  useEffect(() => {
    setMounted(true)
  }, [])

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

  // Esc 关闭 + 打开时锁定背景滚动
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open || !mounted) return null

  const totalQty = cartTotalQty(items)
  const prices = items.map((item) => parseItemPrice(item.price))
  const hasFullPrices = items.length > 0 && prices.every((p) => p != null)
  const totalAmount = hasFullPrices
    ? prices.reduce((sum, p, idx) => sum + (p ?? 0) * items[idx].qty, 0)
    : null
  const checkoutUrl = buildCheckoutUrl(getStoreUrl(), siteId, items)

  const handleQty = (sku: string, nextQty: number) => {
    updateCartQty(siteId, sku, nextQty)
    refresh()
  }

  const handleRemove = (sku: string) => {
    removeCartItem(siteId, sku)
    refresh()
  }

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
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-sm transform-gpu flex-col border-l border-neutral-200 bg-white shadow-2xl transition-transform duration-300 ease-out dark:border-white/10 dark:bg-[#1c1c1e]">
        <header className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 dark:border-white/5">
          <h2 className="text-base font-extrabold tracking-tight text-neutral-900 dark:text-white">
            购物车
          </h2>
          <button
            type="button"
            aria-label="关闭购物车"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors duration-200 ease-out hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <FiX className="h-4 w-4" />
          </button>
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
                        onClick={() => handleRemove(item.sku)}
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
                          onClick={() => handleQty(item.sku, item.qty - 1)}
                          className="flex h-7 w-7 items-center justify-center text-neutral-600 transition-colors duration-200 ease-out hover:text-neutral-900 disabled:opacity-40 dark:text-neutral-300 dark:hover:text-white"
                        >
                          <FiMinus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-7 text-center text-xs font-bold text-neutral-900 dark:text-white">
                          {item.qty}
                        </span>
                        <button
                          type="button"
                          aria-label="增加数量"
                          onClick={() => handleQty(item.sku, item.qty + 1)}
                          className="flex h-7 w-7 items-center justify-center text-neutral-600 transition-colors duration-200 ease-out hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
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
              <a
                href={checkoutUrl}
                className="mt-3 block w-full rounded-xl bg-green-600 py-2.5 text-center text-sm font-bold text-white transition-colors duration-200 ease-out hover:bg-green-500"
              >
                去结算
              </a>
            </footer>
          </>
        )}
      </aside>
    </div>
  )
}
