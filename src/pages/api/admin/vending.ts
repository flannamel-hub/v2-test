import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyAdminMaintenancePassword } from '@/src/lib/admin/maintenancePassword'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'
import {
  normalizeVendingTitle,
  normalizeVendingUrl,
} from '@/src/lib/blog/vendingDefaults'
import { getSiteQuotaState } from '@/src/lib/blog/quotaState'
import {
  getVendingConfig,
  updateVendingConfig,
} from '@/src/lib/blog/vendingSettings'

type VendingResponse = {
  success: boolean
  enabled?: boolean
  url?: string
  title?: string
  id?: string | null
  source?: string
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VendingResponse>
) {
  try {
    if (req.method === 'GET') {
      if (req.query.verifyAddress === '1') {
        if (!verifyAdminMaintenancePassword(req)) {
          return res.status(403).json({
            success: false,
            error: '维护密码错误',
          })
        }
        return res.status(200).json({ success: true })
      }

      const config = await getVendingConfig()
      return res.status(200).json({ success: true, ...config })
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
      // P10-B1:浏览器后台保存需登录态(Basic/Cookie);维护密码豁免保留(平台侧同步)
      if (!verifyAdminRequest(req) && !verifyAdminMaintenancePassword(req, body)) {
        return res.status(401).json({ success: false, error: '未授权' })
      }
      // P8:贩售机组件为专业版权益——免费版商户侧保存一律拒绝;
      // 携带有效维护密码的请求视为平台侧统一同步,放行。
      const quotaState = await getSiteQuotaState()
      if (quotaState.plan !== 'pro' && !verifyAdminMaintenancePassword(req, body)) {
        return res.status(403).json({
          success: false,
          error: '贩售机组件为专业版权益，升级后可用',
        })
      }
      const url = String(body.url || '').trim()
      if (url && !url.startsWith('http')) {
        return res.status(400).json({
          success: false,
          error: '贩售机地址必须以 http 开头',
        })
      }
      const current = await getVendingConfig()
      const hasUrl = typeof body.url === 'string' && body.url.trim() !== ''
      const hasTitle = typeof body.title === 'string' && body.title.trim() !== ''
      const nextUrl = hasUrl ? normalizeVendingUrl(url) : current.url
      const nextTitle = hasTitle
        ? normalizeVendingTitle(String(body.title || '').trim())
        : current.title
      const changesProtectedFields =
        (hasUrl && nextUrl !== current.url) ||
        (hasTitle && nextTitle !== current.title)

      if (
        changesProtectedFields &&
        !verifyAdminMaintenancePassword(req, body)
      ) {
        return res.status(403).json({
          success: false,
          error: '修改贩售机地址需要维护密码',
        })
      }

      const config = await updateVendingConfig({
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        url: hasUrl ? nextUrl : undefined,
        title: hasTitle ? nextTitle : undefined,
      })
      return res.status(200).json({ success: true, ...config })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误'
    return res.status(500).json({ success: false, error: message })
  }
}
