'use client'

import { ReactNode, useEffect, useLayoutEffect, useRef } from 'react'

type TweetAsideScrollSyncProps = {
  children?: ReactNode
  stickyClassName?: string
  innerClassName?: string
}

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

const DESKTOP_MEDIA = '(min-width: 1024px)'
const FALLBACK_HEADER_HEIGHT = 48

/**
 * 右侧组件栏滚动协同(P18TWEET-7)。
 *
 * 结构:aside(网格项,默认 stretch 铺满轨道) > sticky 容器(top=导航条高度,
 * max-height=视口余量) > inner(自然高度,JS 按页面滚动进度 translateY)。
 *
 * 行为:
 * - 栏内容不超视口:位移恒为 0,纯 CSS sticky 跟随,与旧实现一致;
 * - 栏内容超视口:inner 随页面滚动同步下移(与瀑布区 1:1),滚到栏底后锁定,
 *   回滚反向释放,栏底组件(联系方式/角标)始终可达;
 * - aside 由 JS 写 min-height=内容高,保证短页面也有足够滚动行程,
 *   页面滚到底时右栏底部恰好完全展现(终态对齐);
 * - <1024px 右栏 display:none,自动还原内联样式,不影响移动端。
 */
export function TweetAsideScrollSync({
  children,
  stickyClassName,
  innerClassName,
}: TweetAsideScrollSyncProps) {
  const stickyRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useIsomorphicLayoutEffect(() => {
    const sticky = stickyRef.current
    const inner = innerRef.current
    const aside = sticky?.parentElement
    if (!sticky || !inner || !aside) return

    let frame = 0
    const media = window.matchMedia(DESKTOP_MEDIA)

    const readStickyTop = (): number => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--tweet-header-height')
        .trim()
      const value = parseFloat(raw)
      if (!Number.isFinite(value) || value <= 0) return FALLBACK_HEADER_HEIGHT
      return raw.endsWith('rem') ? value * 16 : value
    }

    const reset = () => {
      aside.style.minHeight = ''
      inner.style.transform = ''
    }

    const sync = () => {
      frame = 0
      const innerHeight = inner.offsetHeight
      if (!media.matches || innerHeight <= 0) {
        reset()
        return
      }
      const stickyTop = readStickyTop()
      const cap = window.innerHeight - stickyTop
      if (cap <= 0 || innerHeight <= cap) {
        reset()
        return
      }
      aside.style.minHeight = `${innerHeight}px`
      const travel = innerHeight - cap
      const asideTop = aside.getBoundingClientRect().top + window.scrollY
      const progress = window.scrollY - (asideTop - stickyTop)
      const shift = Math.min(Math.max(progress, 0), travel)
      inner.style.transform = `translate3d(0, ${shift}px, 0)`
    }

    const requestSync = () => {
      if (frame) return
      frame = window.requestAnimationFrame(sync)
    }

    const observer = new ResizeObserver(requestSync)
    observer.observe(inner)
    observer.observe(aside)
    window.addEventListener('scroll', requestSync, { passive: true })
    window.addEventListener('resize', requestSync)
    media.addEventListener('change', requestSync)
    requestSync()

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', requestSync)
      window.removeEventListener('resize', requestSync)
      media.removeEventListener('change', requestSync)
      if (frame) window.cancelAnimationFrame(frame)
      reset()
    }
  }, [])

  return (
    <div ref={stickyRef} className={stickyClassName}>
      <div ref={innerRef} className={innerClassName}>
        {children}
      </div>
    </div>
  )
}
