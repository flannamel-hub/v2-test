import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import {
  FiBell,
  FiClipboard,
  FiDownload,
  FiFileText,
  FiGrid,
  FiHome,
  FiMoreHorizontal,
  FiUsers,
} from 'react-icons/fi'
import type { IconType } from 'react-icons'
import { classNames } from '@/src/lib/util'
import type { Page, Title } from '@/src/types/blog'
import { ShopCartButton } from './ShopCartButton'

/** P18-D 游客查单页(未上线前固定指向 store 订单查询) */
const GUEST_ORDERS_URL = 'https://store.pro-pl.us/orders'

/** A1 系统页过滤:tag/category/archive 不进导航;friends 由「更多」承担 */
const NAV_EXCLUDED_SLUGS = new Set(['tag', 'category', 'archive', 'friends'])

/**
 * A3 自定义页图标映射:仅「介绍/关于」「下载」「公告」做命名映射,其余默认文档图标。
 * 参考 `.dujiao-ref/Navbar.vue`(lucide users/download/megaphone/file-text)。
 */
const PAGE_ICON_RULES: Array<{ keywords: string[]; icon: IconType }> = [
  { keywords: ['介绍', '关于', 'about'], icon: FiUsers },
  { keywords: ['下载', 'download'], icon: FiDownload },
  { keywords: ['公告', '通知', 'announce'], icon: FiBell },
]

function resolvePageIcon(label: string): IconType {
  const text = (label || '').trim().toLowerCase()
  for (const rule of PAGE_ICON_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      return rule.icon
    }
  }
  return FiFileText
}

/**
 * P18C44-B3 D4:自定义页导航文案归一化——slug 为 `about`(或标题恰为「介绍」)
 * 的导航项统一显示「关于」(用户站点自定义页名「介绍」,前台显示「关于」);
 * 归一化后的文案同样命中 PAGE_ICON_RULES 的「关于」→ people 图标。
 */
export function normalizeShopNavLabel(slug: string, label: string): string {
  const text = (label || '').trim()
  if ((slug || '').trim() === 'about' || text === '介绍') return '关于'
  return text
}

type ShopNavItem = {
  id: string
  label: string
  href: string
  icon: IconType
}

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

/** 导航项(图标+文字):激活态 bg-primary/10 文字 primary(shop 映射为 neutral-900/white 反色) */
const NAV_ITEM_BASE =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm'
const NAV_ITEM_ACTIVE =
  'bg-neutral-900/10 text-neutral-900 dark:bg-white/10 dark:text-white'
/** A5:hover 背景变亮 + 文字变深/变白(独角数卡 hover:bg-accent hover:text-accent-foreground) */
const NAV_ITEM_IDLE =
  'text-neutral-500 hover:bg-neutral-900/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white'

/** 右侧 ghost 动作按钮(查单/购物车同款) */
const GHOST_ACTION_BASE =
  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-900/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white'

/**
 * P18-C4-3 A1/A3/A4/A5:shop 顶部导航(还原独角数卡 Navbar.vue)。
 * fixed 悬浮 + bg-card/80 毛玻璃 + 滚动后 shadow-lg;左站名,中图标导航(系统页已过滤),
 * 右查单/购物车徽标(A4:shop 不渲染主题切换按钮);移动端汉堡菜单收纳导航项。
 * 页面主体由 withNavFooter 壳层 pt-14 补偿固定导航高度。
 */
export function ShopNavbar({
  items,
  title,
}: {
  items: Page[]
  title: Title
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const currentPath = router.asPath

  useEffect(() => {
    setMenuOpen(false)
  }, [currentPath])

  // A5:滚动后加投影(独角数卡 scrolled ? shadow-lg : '';高度恒定 h-14,不影响 pt-14 补偿)
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navItems: ShopNavItem[] = [
    { id: 'home', label: '首页', href: '/', icon: FiHome },
    { id: 'products', label: '商品中心', href: '/archive', icon: FiGrid },
    ...items
      .filter((item) => !NAV_EXCLUDED_SLUGS.has(item.slug))
      .map((item) => {
        // D4:slug=about / 标题「介绍」统一显示「关于」
        const label = normalizeShopNavLabel(item.slug, item.nav || item.title)
        return {
          id: item.id,
          label,
          href: `/${item.slug}`,
          icon: resolvePageIcon(label),
        }
      }),
    { id: 'more', label: '更多', href: '/friends', icon: FiMoreHorizontal },
  ]

  const isActive = (href: string) =>
    href === '/' ? currentPath === '/' : currentPath.startsWith(href)

  const guestOrders = (
    <a
      href={GUEST_ORDERS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={GHOST_ACTION_BASE}
    >
      <FiClipboard className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      游客查单
    </a>
  )

  return (
    <header
      className={classNames(
        'fixed top-0 left-0 right-0 z-50 select-none border-b border-neutral-200/70 bg-white/80 backdrop-blur-md transition-shadow dark:border-neutral-800/70 dark:bg-[#161617]/80',
        scrolled ? 'shadow-lg' : ''
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        <Link
          href="/"
          className="min-w-0 shrink-0 font-bold text-black dark:text-white"
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
                NAV_ITEM_BASE,
                isActive(item.href) ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE
              )}
            >
              <item.icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
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
        <div className="border-t border-neutral-200/70 bg-white/95 backdrop-blur-lg dark:border-neutral-800/70 dark:bg-[#161617]/95 md:hidden">
          <nav className="mx-auto grid w-full grid-cols-2 gap-2 px-4 py-4 sm:grid-cols-3">
            {navItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={classNames(
                  'flex h-10 items-center gap-2 truncate rounded-xl px-3 text-xs font-medium transition-colors sm:text-sm',
                  isActive(item.href)
                    ? 'bg-neutral-900/10 text-neutral-900 dark:bg-white/10 dark:text-white'
                    : 'text-neutral-500 hover:bg-neutral-900/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  )
}
