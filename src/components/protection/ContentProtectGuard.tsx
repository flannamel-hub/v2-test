import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import {
  installContentProtection,
  parseContentProtectEnabled,
} from '@/src/lib/protection/contentProtectDom'

/** P14:全主题内容保护注入壳。
 * - 页面挂载后拉取 /api/admin/content-protect(公开只读);enabled=false 时零副作用;
 * - 仅前台路由启用,/admin 后台不受影响(本组件在 _app 按 isAdminRoute 条件挂载,
 *   此处再按路由防御性判断,双保险);
 * - 防护本体在 src/lib/protection/contentProtectDom.ts,可逆(effect cleanup 即卸载)。 */
export default function ContentProtectGuard() {
  const router = useRouter()
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/content-protect')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setEnabled(parseContentProtectEnabled(json))
      })
      .catch(() => {
        if (!cancelled) setEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const pathname = router.pathname || ''
  const isAdminRoute =
    pathname === '/admin' || pathname.startsWith('/admin/')

  useEffect(() => {
    if (enabled !== true || isAdminRoute) return
    return installContentProtection(document)
  }, [enabled, isAdminRoute])

  return null
}
