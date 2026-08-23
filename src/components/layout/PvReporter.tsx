import { useEffect } from 'react'
import { useRouter } from 'next/router'

// 统计口径:PV = JS 页面视图(爬虫/无 JS 客户端不计入)。
// 计量侧已留 20% 安全边际,FOCUS 对账阈值兜底此类口径噪声。
// 客户端路由切换(asPath 变化)视为一次新页面视图,不做节流。
export function PvReporter() {
  const router = useRouter()

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if ((router.asPath || '').startsWith('/admin')) return

    fetch('/api/internal/pv-flush', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ count: 1 }),
      keepalive: true,
    }).catch(() => {
      // 上报失败静默丢弃,不重试、不提示
    })
  }, [router.asPath])

  return null
}

export default PvReporter
