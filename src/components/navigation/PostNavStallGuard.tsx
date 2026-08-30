'use client'

import Link, { type LinkProps } from 'next/link'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/router'

/** 客户端导航超过该时长仍未完成，视为卡住并弹出提示 */
const STALL_MS = 3000

type PendingNav = { key: string; href: string }

type PostNavStallContextValue = {
  startNav: (key: string, href: string) => (e: MouseEvent) => void
  pendingKey: string | null
  stalledKey: string | null
}

const PostNavStallContext = createContext<PostNavStallContextValue | null>(null)

export function usePostNavStallOptional() {
  return useContext(PostNavStallContext)
}

/** 单例导航 loading 态：key 匹配当前 pending/stalled 才返回 true（供卡片转圈动画消费） */
export function usePostNavLoading(key: string): {
  isLoading: boolean
  isStalled: boolean
} {
  const ctx = useContext(PostNavStallContext)
  if (!ctx) return { isLoading: false, isStalled: false }
  return {
    isLoading: ctx.pendingKey === key,
    isStalled: ctx.stalledKey === key,
  }
}

function clearTimerRef(timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (timerRef.current) {
    clearTimeout(timerRef.current)
    timerRef.current = null
  }
}

export function slugFromPostHref(href: string | null | undefined): string | null {
  if (!href) return null
  const match = href.match(/^\/post\/([^/?#]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export function resolvePostHref(
  href: LinkProps['href'],
  as?: LinkProps['as']
): string | null {
  if (typeof as === 'string' && as.startsWith('/post/')) return as
  if (typeof href === 'string' && href.startsWith('/post/')) return href
  if (href && typeof href === 'object' && !Array.isArray(href)) {
    const pathname = href.pathname
    const slug = href.query?.slug
    if (pathname === '/post/[slug]' && typeof slug === 'string' && slug) {
      return `/post/${slug}`
    }
  }
  return null
}

function PostNavStallModal({
  open,
  onRetry,
  onDismiss,
}: {
  open: boolean
  onRetry: () => void
  onDismiss: () => void
}) {
  if (!open) return null

  return (
    <div
      className="post-nav-stall-backdrop"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        className="post-nav-stall-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-nav-stall-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="post-nav-stall-title" className="post-nav-stall-title">
          网站开小差了~请刷新一下重新尝试
        </p>
        <p className="post-nav-stall-desc">
          预览可能已生成完成，可重新打开文章；或再次点击同一张卡片。
        </p>
        <div className="post-nav-stall-actions">
          <button type="button" className="post-nav-stall-btn-secondary" onClick={onDismiss}>
            稍后再试
          </button>
          <button type="button" className="post-nav-stall-btn-primary" onClick={onRetry}>
            重新打开
          </button>
        </div>
      </div>
    </div>
  )
}

export function PostNavStallProvider({
  children,
  enabled = true,
}: {
  children: ReactNode
  enabled?: boolean
}) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [stalledKey, setStalledKey] = useState<string | null>(null)
  const pendingRef = useRef<PendingNav | null>(null)
  const reloadingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = useCallback(() => {
    if (reloadingRef.current) return
    clearTimerRef(timerRef)
    pendingRef.current = null
    setPendingKey(null)
    setStalledKey(null)
    setShowModal(false)
  }, [])

  useEffect(() => {
    if (!enabled) return
    const done = () => reset()
    router.events.on('routeChangeComplete', done)
    router.events.on('routeChangeError', done)
    return () => {
      router.events.off('routeChangeComplete', done)
      router.events.off('routeChangeError', done)
      clearTimerRef(timerRef)
    }
  }, [router.events, reset, enabled])

  const forceReload = useCallback((href: string) => {
    reloadingRef.current = true
    clearTimerRef(timerRef)
    setShowModal(false)
    setStalledKey(null)
    window.location.href = href
  }, [])

  const startNav = useCallback(
    (key: string, href: string) => (e: MouseEvent) => {
      if (!enabled) return

      if (
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        ('button' in e && e.button !== 0)
      ) {
        return
      }

      if (pendingRef.current?.key === key) {
        e.preventDefault()
        forceReload(href)
        return
      }

      pendingRef.current = { key, href }
      setPendingKey(key)
      setShowModal(false)
      setStalledKey(null)
      clearTimerRef(timerRef)
      timerRef.current = setTimeout(() => {
        if (pendingRef.current?.key === key) {
          setStalledKey(key)
          setShowModal(true)
        }
      }, STALL_MS)
    },
    [enabled, forceReload]
  )

  const handleRetry = useCallback(() => {
    const href = pendingRef.current?.href
    if (href) forceReload(href)
  }, [forceReload])

  const contextValue = {
    startNav,
    pendingKey,
    stalledKey,
  }

  if (!enabled) {
    return <>{children}</>
  }

  return (
    <PostNavStallContext.Provider value={contextValue}>
      {children}
      <PostNavStallModal
        open={showModal}
        onRetry={handleRetry}
        onDismiss={() => setShowModal(false)}
      />
    </PostNavStallContext.Provider>
  )
}

type PostNavLinkProps = ComponentPropsWithoutRef<typeof Link> & {
  navKey?: string
}

/** 文章内页链接：Standard / Tweet 主题下启用导航卡住兜底 */
export function PostNavLink({
  href,
  navKey,
  children,
  onClick,
  as,
  ...rest
}: PostNavLinkProps) {
  const stall = usePostNavStallOptional()
  const resolvedHref = resolvePostHref(href, as)
  const key = navKey ?? slugFromPostHref(resolvedHref) ?? undefined

  return (
    <Link
      href={href}
      as={as}
      onClick={(e) => {
        if (stall && resolvedHref && key) {
          stall.startNav(key, resolvedHref)(e)
        }
        onClick?.(e)
      }}
      {...rest}
    >
      {children}
    </Link>
  )
}
