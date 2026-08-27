import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { FiClipboard } from 'react-icons/fi'
import { classNames } from '@/src/lib/util'
import type { Page, Title } from '@/src/types/blog'
import { ShopCartButton } from './ShopCartButton'

/** P18-D 游客查单页(未上线前固定指向 store 订单查询) */
const GUEST_ORDERS_URL = 'https://store.pro-pl.us/orders'

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      {open ? (
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      ) : (
        <>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </>
      )}
    </svg>
  )
}

/**
 * P18-C4-1.2: shop 主题顶部导航(仿独角数卡)。
 * Logo + 首页 + 自定义页面入口(Notion Page 数据) + 游客查单(外链) + 购物车徽标。
 * 移动端收进汉堡菜单;查单与购物车保持常驻可见。
 */
export function ShopNavbar({
  items,
  title,
  logo,
}: {
  items: Page[]
  title: Title
  logo?: DatabaseObjectResponse['icon']
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const currentPath = router.asPath

  useEffect(() => {
    setMenuOpen(false)
  }, [currentPath])

  const navItems: { id: string; label: string; href: string }[] = [
    { id: 'home', label: '首页', href: '/' },
    { id: 'products', label: '商品中心', href: '/archive' },
    ...items.map((item) => ({
      id: item.id,
      label: item.nav || item.title,
      href: `/${item.slug}`,
    })),
    { id: 'more', label: '更多', href: '/friends' },
  ]

  const isActive = (href: string) =>
    href === '/' ? currentPath === '/' : currentPath.startsWith(href)

  const guestOrders = (
    <a
      href={GUEST_ORDERS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-900/10 bg-neutral-900/5 px-3 py-1.5 text-xs font-semibold text-neutral-800 transition-colors hover:bg-neutral-900/10 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
    >
      <FiClipboard className="h-3.5 w-3.5" aria-hidden />
      游客查单
    </a>
  )

  return (
    <header className="sticky top-0 z-40 select-none border-b border-neutral-200/70 bg-white/85 backdrop-blur-lg backdrop-saturate-200 dark:border-neutral-800/70 dark:bg-black/75">
      <div className="mx-auto flex h-14 w-full items-center justify-between gap-3 px-4 md:px-6 lg:w-screen-lg lg:px-11">
        <Link
          href="/"
          className="flex min-w-0 shrink-0 items-center font-bold text-black dark:text-white"
          aria-label={title?.text || '首页'}
        >
          <span className="max-w-[10rem] truncate text-sm md:max-w-none md:text-base">
            {title?.text}
          </span>
        </Link>

        <nav className="hidden h-full items-center justify-end gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={classNames(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                isActive(item.href)
                  ? 'bg-neutral-900/5 text-black dark:bg-white/10 dark:text-white'
                  : 'text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-white'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {guestOrders}
          <ShopCartButton />
          <button
            type="button"
            aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-12 py-3 text-black dark:text-white md:hidden"
          >
            <HamburgerIcon open={menuOpen} />
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="border-t border-neutral-200/70 bg-white/95 backdrop-blur-lg dark:border-neutral-800/70 dark:bg-black/95 md:hidden">
          <nav className="mx-auto grid w-full grid-cols-2 gap-2 px-4 py-4 sm:grid-cols-3">
            {navItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={classNames(
                  'flex h-10 items-center truncate rounded-xl px-3 text-sm font-medium transition-colors',
                  isActive(item.href)
                    ? 'bg-neutral-900/5 text-black dark:bg-white/10 dark:text-white'
                    : 'text-neutral-500 hover:bg-neutral-900/5 hover:text-black dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  )
}
