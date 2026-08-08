import { useEffect } from 'react'
import type { ClickAdConfig } from '@/src/lib/blog/clickAdDefaults'
import { getClickAdDayKey } from '@/src/lib/blog/clickAdDefaults'

type Props = {
  config?: ClickAdConfig | null
  /** 仅首页启用 */
  isHomePage?: boolean
}

function isExcludedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true
  if (target.closest('[data-blog-vending="1"]')) return true
  if (target.closest('.tweet-vending-btn')) return true
  if (target.closest('.announcement-popup')) return true
  if (target.closest('.popup-ad')) return true
  if (target.closest('[role="dialog"]')) return true
  return false
}

function alreadyTriggeredToday(): boolean {
  try {
    return localStorage.getItem(getClickAdDayKey()) === '1'
  } catch {
    return false
  }
}

function markTriggeredToday(): void {
  try {
    localStorage.setItem(getClickAdDayKey(), '1')
  } catch {
    // ignore private mode failures
  }
}

/**
 * 首页遮罩广告：在捕获阶段监听首次有效点击，
 * 新标签打开广告链接，同时不拦截原点击行为。
 */
export function ClickAdCapture({ config, isHomePage = false }: Props) {
  useEffect(() => {
    if (!isHomePage || !config?.enabled) return
    const url = (config.url || '').trim()
    if (!url) return
    if (alreadyTriggeredToday()) return

    let done = false

    const onPointerDownCapture = (event: PointerEvent) => {
      if (done) return
      if (event.button !== 0) return
      if (isExcludedTarget(event.target)) return

      done = true
      markTriggeredToday()

      try {
        window.open(url, '_blank', 'noopener,noreferrer')
      } catch {
        // ignore popup blockers / restricted contexts
      }

      document.removeEventListener(
        'pointerdown',
        onPointerDownCapture,
        true
      )
    }

    document.addEventListener('pointerdown', onPointerDownCapture, true)
    return () => {
      document.removeEventListener(
        'pointerdown',
        onPointerDownCapture,
        true
      )
    }
  }, [isHomePage, config?.enabled, config?.url])

  return null
}
