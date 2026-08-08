import Link from 'next/link'
import { useRouter } from 'next/router'
import type { VendingConfig } from '@/src/lib/blog/vendingDefaults'
import type { SocialLinksWidgetType } from '@/src/lib/blog/format/widget/socialLinks'
import { SocialLinks } from '@/src/components/widget/SocialLinks'
import {
  GALLERY_LOGIN_URL,
  GALLERY_LOGO_SRC,
} from './galleryConstants'
import { GALLERY_NAV_SECTIONS } from './galleryNav'
import { getGalleryNavIcon } from './galleryIcons'
import { GallerySearchBox } from './GallerySearchBox'

export const GALLERY_HEADER_HEIGHT = 72

const GALLERY_LOGO_BUST = 'v=5'

type GallerySidebarProps = {
  /** 移动端抽屉是否展开（桌面端忽略，始终常驻） */
  open?: boolean
  onClose?: () => void
  vendingConfig?: VendingConfig | null
  vendingEnabled?: boolean
  socialLinks?: SocialLinksWidgetType | null
}

export const GallerySidebar = ({
  open = false,
  onClose,
  vendingConfig,
  vendingEnabled = true,
  socialLinks,
}: GallerySidebarProps) => {
  const router = useRouter()
  const showVending = vendingConfig?.enabled ?? vendingEnabled
  const vendingUrl = vendingConfig?.url || GALLERY_LOGIN_URL

  const isActive = (href: string) => {
    if (href === '/') return router.pathname === '/'
    const path = href.split('?')[0]
    if (path.startsWith('/post/')) {
      return router.asPath === path
    }
    return router.asPath === path || router.asPath.startsWith(path + '/')
  }

  return (
    <aside
      className={`font-gallery fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col border-r border-neutral-200 bg-white antialiased transition-transform duration-300 ease-out lg:z-30 lg:w-[260px] lg:max-w-none lg:transition-none ${
        open ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0`}
    >
      <div
        className="flex shrink-0 items-center justify-between px-5"
        style={{ height: GALLERY_HEADER_HEIGHT }}
      >
        <Link
          href="/"
          onClick={onClose}
          className="flex items-center gap-2 lg:hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${GALLERY_LOGO_SRC}?${GALLERY_LOGO_BUST}`}
            alt=""
            width={26}
            height={26}
            className="h-[26px] w-[26px] shrink-0 object-contain"
          />
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭菜单"
          className="flex h-9 w-9 items-center justify-center rounded-md text-2xl leading-none text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 lg:hidden"
        >
          ×
        </button>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto border-t border-neutral-200 px-5 pb-4 pt-6">
        {GALLERY_NAV_SECTIONS.map((section, sectionIndex) => (
          <div
            key={section.title ?? 'home'}
            className={sectionIndex > 0 ? 'mt-6' : ''}
          >
            {section.title ? (
              <div className="mb-1.5 px-2 text-[15px] font-semibold text-neutral-900">
                {section.title}
              </div>
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const NavIcon = getGalleryNavIcon(item.icon)
                const active = isActive(item.href)
                const isHome = item.href === '/'
                return (
                  <li key={`${section.title}-${item.label}-${item.href}`}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={`flex items-center gap-3 rounded-md px-2 py-2 text-[15px] transition-colors ${
                        active
                          ? 'bg-neutral-100 font-semibold text-neutral-900'
                          : 'font-medium text-neutral-800 hover:bg-neutral-50'
                      }`}
                    >
                      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-black">
                        <NavIcon />
                      </span>
                      {item.label}
                    </Link>
                    {isHome ? <GallerySearchBox /> : null}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {showVending || socialLinks?.links ? (
      <div className="shrink-0 border-t border-neutral-200 px-4 py-5">
        {showVending ? (
          <a
            href={vendingUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-blog-vending="1"
            className="block w-full rounded-md bg-black py-2 text-center text-[13px] font-normal text-white transition-all hover:bg-neutral-800 active:scale-[0.98] active:bg-neutral-900"
          >
            STORE
          </a>
        ) : null}
        {socialLinks?.links ? (
          <SocialLinks
            links={socialLinks.links}
            variant="gallery"
            className={showVending ? 'mt-3' : ''}
          />
        ) : null}
      </div>
      ) : null}
    </aside>
  )
}
