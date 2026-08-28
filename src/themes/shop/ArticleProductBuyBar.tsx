import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiShoppingBag } from 'react-icons/fi'
import { Post } from '@/src/types/blog'
import {
  NOT_PURCHASABLE_DESCRIPTION,
  NOT_PURCHASABLE_MESSAGE,
} from './ShopBuyButtons'

type ArticleProductBuyBarProps = {
  post: Post
  /** standard=shop 绿条视觉;gallery/tweet=中性圆角卡片 */
  variant?: 'standard' | 'gallery' | 'tweet'
}

/**
 * P18-C4-6:非 shop 主题(standard/anzifan/gallery/tweet)文章内页商品购买条。
 *
 * - 读取 Step7 商品字段(post.options.linkedProductSku/Url/Price/Name);
 *   **判定只看 sku 非空**:无 sku 整块渲染 null(普通文章零影响);
 * - 仅「立即购买」:有 buyUrl → 新窗口打开;无 buyUrl(含仅存码未查到商品)
 *   → 弹「当前不可购买」页内居中弹窗(复制 ShopBuyButtons 精简版 modal,
 *   portal 挂 document.body,点遮罩/按钮/Esc 关闭;不改动 shop 组件);
 * - 无加购按钮/徽标/购物车(非 shop 主题);
 * - 商品名称缺失回退文章标题;价格缺失显示「—」;
 * - standard 沿用 shop 绿条视觉(同 ShopProductBar 容器/图标/黑色购买按钮);
 *   gallery/tweet 用中性圆角卡片(白/暗底、边框,按钮中性黑,深浅色适配);
 * - hydrate 安全:SSR 输出与 client 首帧一致,弹窗仅点击后出现。
 */
export function ArticleProductBuyBar({
  post,
  variant = 'standard',
}: ArticleProductBuyBarProps) {
  // 不可购买居中弹窗(ShopBuyButtons modal 精简复制;挂 body 避开 transform 祖先)
  const [modalOpen, setModalOpen] = useState(false)
  const [portalReady, setPortalReady] = useState(false)
  useEffect(() => {
    setPortalReady(true)
  }, [])
  useEffect(() => {
    if (!modalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen])

  const linkedSku = post.options?.linkedProductSku?.trim()
  // P18C46 拍板:判定只看 sku;sku 空 → null(url/price 残留也不显示)
  if (!linkedSku) return null

  const buyUrl = post.options?.linkedProductUrl?.trim()
  const linkedPrice = post.options?.linkedProductPrice?.trim()
  // 优先商品名称,缺失回退文章标题
  const productName =
    post.options?.linkedProductName?.trim() || post.title?.trim() || ''
  const canBuy = Boolean(buyUrl)

  const isStandard = variant === 'standard'

  const asideClass = isStandard
    ? 'my-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-2xl border border-green-600/20 bg-green-50/70 px-5 py-4 dark:border-green-400/20 dark:bg-green-400/5'
    : 'my-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/10 dark:bg-white/5'

  const iconChipClass = isStandard
    ? 'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green-600/10 text-green-600 dark:text-green-400'
    : 'grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300'

  const priceClass = isStandard
    ? 'text-lg font-extrabold leading-none text-green-700 dark:text-green-400'
    : 'text-lg font-extrabold leading-none text-neutral-900 dark:text-white'

  const buyClass = isStandard
    ? 'rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white transition-colors duration-200 ease-out hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200'
    : 'rounded-lg bg-black px-5 py-2.5 text-sm font-bold text-white transition-colors duration-200 ease-out hover:bg-neutral-800 active:bg-neutral-900 dark:bg-white dark:text-black dark:hover:bg-neutral-200'

  const openNotPurchasable = () => {
    if (typeof window === 'undefined') return
    setModalOpen(true)
  }

  const modalNode =
    portalReady && modalOpen
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="article-buy-not-purchasable-title"
            data-testid="article-buy-not-purchasable-modal"
            className="fixed inset-0 z-[70] flex items-center justify-center bg-neutral-900/50 p-4 dark:bg-black/70"
            onClick={() => setModalOpen(false)}
          >
            <div
              className="w-full max-w-xs rounded-2xl border border-neutral-200 bg-white p-5 text-center shadow-xl dark:border-white/10 dark:bg-[#1c1c1e]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                id="article-buy-not-purchasable-title"
                className="text-base font-bold text-neutral-900 dark:text-white"
              >
                {NOT_PURCHASABLE_MESSAGE}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                {NOT_PURCHASABLE_DESCRIPTION}
              </p>
              <button
                type="button"
                data-testid="article-buy-not-purchasable-close"
                className="mt-4 h-9 w-full rounded-xl bg-neutral-900 text-sm font-bold text-white transition-colors duration-200 ease-out hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                onClick={() => setModalOpen(false)}
              >
                知道了
              </button>
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <aside
      data-testid="article-buy-bar"
      data-variant={variant}
      className={asideClass}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span className={iconChipClass} aria-hidden>
          <FiShoppingBag className={isStandard ? 'h-5 w-5' : 'h-4 w-4'} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              data-testid="article-buy-bar-name"
              title={productName}
              className="min-w-0 max-w-full truncate text-sm font-bold text-neutral-900 dark:text-white"
            >
              {productName || '商品'}
            </span>
            {linkedPrice ? (
              <span data-testid="article-buy-bar-price" className={priceClass}>
                ¥{linkedPrice.replace(/^[¥￥]\s*/, '')}
              </span>
            ) : (
              /* 有 sku 无价格(查不到/下架仅存码)→「—」占位,保持商品式样 */
              <span
                data-testid="article-buy-bar-price-placeholder"
                className="text-lg font-extrabold leading-none text-neutral-400 dark:text-neutral-500"
              >
                —
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="shrink-0">
        {canBuy ? (
          <a
            href={buyUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="article-buy-bar-buy"
            className={buyClass}
          >
            立即购买
          </a>
        ) : (
          <button
            type="button"
            data-testid="article-buy-bar-buy"
            className={buyClass}
            onClick={openNotPurchasable}
          >
            立即购买
          </button>
        )}
        {modalNode}
      </div>
    </aside>
  )
}
