import { useEffect } from 'react'
import { useRouter } from 'next/router'

// 统计口径:PV = JS 页面视图(爬虫/无 JS 客户端不计入)。
// 计量侧已留 20% 安全边际,FOCUS 对账阈值兜底此类口径噪声。
// 客户端路由切换(asPath 变化)视为一次新页面视图,不做节流。
// 会话级聚合:视图计数累积(模块级,同一 SPA 会话跨路由共享),
// 10s 无新视图或页面隐藏/卸载时批量上报一次,降低 pv-flush 函数调用次数。
const FLUSH_DEBOUNCE_MS = 10_000
// 与 /api/internal/pv-flush 的 COUNT_MAX 保持一致,超出部分留待下次上报
const FLUSH_COUNT_MAX = 1000

let pendingCount = 0
let flushTimer: ReturnType<typeof setTimeout> | null = null

function flushPvCount() {
  if (pendingCount <= 0) return
  const count = Math.min(pendingCount, FLUSH_COUNT_MAX)
  pendingCount -= count
  fetch('/api/internal/pv-flush', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ count }),
    keepalive: true,
  }).catch(() => {
    // 上报失败静默,不重试、不提示;计数加回,随下次触发合并上报
    pendingCount += count
  })
}

function scheduleDebounceFlush() {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushPvCount()
  }, FLUSH_DEBOUNCE_MS)
}

export function PvReporter() {
  const router = useRouter()

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if ((router.asPath || '').startsWith('/admin')) return

    pendingCount += 1
    scheduleDebounceFlush()
  }, [router.asPath])

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return

    const handlePageHide = () => flushPvCount()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPvCount()
    }
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return null
}

export default PvReporter
