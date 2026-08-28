import Link from 'next/link'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { classNames } from '@/src/lib/util'

/**
 * shop 主题统一分页控件(P18C45UI 批1 A1,参照独角数卡 Products.vue):
 * 居中圆角胶囊按钮组——上一页/下一页圆形箭头钮(首/末页禁用置灰,
 * disabled:opacity-40,同独角数卡),页码窗口当前页前后各 2 页最多 5 个;
 * 当前页蓝色实心高亮(与侧栏选中态同蓝),其余白底细描边、hover 蓝描边蓝字
 * (同独角数卡 hover:border-primary hover:text-primary)。
 * 服务端分页传 hrefForPage(渲染 <Link>,/archive/[page] 页签);客户端分页传
 * onPageChange(渲染 <button>,首页精选区)——两处复用同一样式,视觉统一。
 * totalPages ≤ 1 时整体不渲染。
 */

/** 页码窗口:当前页前后各 2 页,最多 5 个(同独角数卡 Products pageWindow) */
export function getShopPageWindow(
  currentPage: number,
  totalPages: number
): number[] {
  const start = Math.max(1, currentPage - 2)
  const end = Math.min(totalPages, start + 4)
  const realStart = Math.max(1, end - 4)
  const pages: number[] = []
  for (let p = realStart; p <= end; p++) pages.push(p)
  return pages
}

/** A1:分页圆角按钮基样式(独角数卡 products 分页胶囊) */
export const SHOP_PAGE_BUTTON_BASE =
  'grid h-10 min-w-[40px] place-items-center rounded-full border px-3 transition-colors duration-200 ease-out'

/** 非当前页:白底细描边,hover 蓝描边蓝字(同独角数卡 primary hover) */
export const SHOP_PAGE_BUTTON_IDLE =
  'border-neutral-200 bg-white text-neutral-500 hover:border-blue-500 hover:text-blue-500 dark:border-white/10 dark:bg-[#1c1c1e] dark:text-neutral-400 dark:hover:border-blue-400 dark:hover:text-blue-400'

/** 当前页:蓝色实心高亮(同侧栏选中态),hover 微亮 */
export const SHOP_PAGE_BUTTON_ACTIVE =
  'border-blue-500 bg-blue-500 text-white hover:bg-blue-400'

type ShopPaginationProps = {
  currentPage: number
  totalPages: number
  /** 服务端分页:页码 → href(第 1 页通常映射 /archive 根路径) */
  hrefForPage?: (page: number) => string
  /** 客户端分页:页码点击回调 */
  onPageChange?: (page: number) => void
  ariaLabel?: string
}

export function ShopPagination({
  currentPage,
  totalPages,
  hrefForPage,
  onPageChange,
  ariaLabel = '分页',
}: ShopPaginationProps) {
  if (totalPages <= 1) return null

  const prevDisabled = currentPage <= 1
  const nextDisabled = currentPage >= totalPages
  const arrowClass = classNames(
    SHOP_PAGE_BUTTON_BASE,
    SHOP_PAGE_BUTTON_IDLE,
    'font-bold disabled:cursor-not-allowed disabled:opacity-40'
  )
  const pageClass = (active: boolean) =>
    classNames(
      SHOP_PAGE_BUTTON_BASE,
      'text-sm font-bold',
      active ? SHOP_PAGE_BUTTON_ACTIVE : SHOP_PAGE_BUTTON_IDLE
    )

  return (
    <nav
      aria-label={ariaLabel}
      data-testid="shop-pagination"
      className="mt-8 flex justify-center gap-2"
    >
      {prevDisabled ? (
        <button type="button" aria-label="上一页" disabled className={arrowClass}>
          <FiChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      ) : hrefForPage ? (
        <Link href={hrefForPage(currentPage - 1)} aria-label="上一页" className={arrowClass}>
          <FiChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
      ) : (
        <button
          type="button"
          aria-label="上一页"
          className={arrowClass}
          onClick={() => onPageChange?.(currentPage - 1)}
        >
          <FiChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      )}

      {getShopPageWindow(currentPage, totalPages).map((p) =>
        hrefForPage ? (
          <Link
            key={p}
            href={hrefForPage(p)}
            aria-current={p === currentPage ? 'page' : undefined}
            className={pageClass(p === currentPage)}
          >
            {p}
          </Link>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === currentPage ? 'page' : undefined}
            className={pageClass(p === currentPage)}
            onClick={() => onPageChange?.(p)}
          >
            {p}
          </button>
        )
      )}

      {nextDisabled ? (
        <button type="button" aria-label="下一页" disabled className={arrowClass}>
          <FiChevronRight className="h-4 w-4" aria-hidden />
        </button>
      ) : hrefForPage ? (
        <Link href={hrefForPage(currentPage + 1)} aria-label="下一页" className={arrowClass}>
          <FiChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : (
        <button
          type="button"
          aria-label="下一页"
          className={arrowClass}
          onClick={() => onPageChange?.(currentPage + 1)}
        >
          <FiChevronRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </nav>
  )
}
