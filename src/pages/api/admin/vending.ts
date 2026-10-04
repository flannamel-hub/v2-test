import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyAdminMaintenancePassword } from '@/src/lib/admin/maintenancePassword'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'
import { getSiteQuotaState } from '@/src/lib/blog/quotaState'
import {
  applyMerchantVendingUpdate,
  applyPlatformVendingSync,
  getVendingAdminState,
} from '@/src/lib/blog/vendingSettings'

type VendingResponse = {
  success: boolean
  enabled?: boolean
  url?: string
  title?: string
  mode?: 'official' | 'custom'
  officialTitle?: string | null
  officialUrl?: string | null
  customTitle?: string | null
  customUrl?: string | null
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

      // Q10:GET 返回完整 state（含 vending_mode 新字段；新列未配置时 null 合法）
      const state = await getVendingAdminState()
      return res.status(200).json({ success: true, ...state })
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
      // P10-B1:浏览器后台保存需登录态(Basic/Cookie);维护密码豁免保留(平台侧同步)
      const isPlatformSync = verifyAdminMaintenancePassword(req, body)
      if (!verifyAdminRequest(req) && !isPlatformSync) {
        return res.status(401).json({ success: false, error: '未授权' })
      }
      // P8:贩售机组件为专业版权益——免费版商户侧保存一律拒绝;
      // 携带有效维护密码的请求视为平台侧统一同步,放行。
      const quotaState = await getSiteQuotaState()
      if (quotaState.plan !== 'pro' && !isPlatformSync) {
        return res.status(403).json({
          success: false,
          error: '贩售机组件为专业版权益，升级后可用',
        })
      }

      // Q5:mode 非法值 400 拒绝（不静默归一）
      const mode = body.mode
      if (mode !== undefined && mode !== 'official' && mode !== 'custom') {
        return res.status(400).json({
          success: false,
          error: 'mode 参数非法（仅支持 official / custom）',
        })
      }

      const url = String(body.url || '').trim()
      if (url && !url.startsWith('http')) {
        return res.status(400).json({
          success: false,
          error: '贩售机地址必须以 http 开头',
        })
      }

      // L5:custom 模式 title ≤ 40 字（空→默认「贩售机」）；url 必填 http 开头
      if (mode === 'custom') {
        const title = String(body.title || '').trim() || '贩售机'
        if (title.length > 40) {
          return res.status(400).json({
            success: false,
            error: '按钮名称最多 40 字',
          })
        }
        if (!url.startsWith('http')) {
          return res.status(400).json({
            success: false,
            error: '贩售机地址必须以 http 开头',
          })
        }
      }

      // VENDING_MODE 分流：维护密码=平台同步（custom 站跳过覆写）；登录商户=三态保存
      // （旧「地址字段需维护密码」403 拦截块已按产品决策移除，放行登录商户）
      const state = isPlatformSync
        ? await applyPlatformVendingSync({
            enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
            title: typeof body.title === 'string' ? body.title : undefined,
            url: typeof body.url === 'string' ? body.url : undefined,
          })
        : await applyMerchantVendingUpdate({
            enabled:
              typeof body.enabled === 'boolean' ? body.enabled : undefined,
            mode: mode === 'official' || mode === 'custom' ? mode : undefined,
            title: typeof body.title === 'string' ? body.title : undefined,
            url: typeof body.url === 'string' ? body.url : undefined,
          })
      // Q10:POST 同样返回完整 state（含新字段）
      return res.status(200).json({ success: true, ...state })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误'
    return res.status(500).json({ success: false, error: message })
  }
}
