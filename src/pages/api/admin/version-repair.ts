import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyAdminMaintenancePassword } from '@/src/lib/admin/maintenancePassword'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'
import {
  getGalleryFeatureEnabled,
  setGalleryFeatureEnabled,
} from '@/src/lib/blog/galleryFeatureGate'
import { getSiteThemeCode } from '@/src/lib/blog/siteTheme'
import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'

/**
 * 图库基座手术批2:【版本修复】隐藏页 API。
 *
 * - GET ?state=1:仅后台会话(verifyAdminRequest)→ 返回
 *   {success, galleryFeatureEnabled, currentTheme}(编辑器/主题下拉门控用,无需密码)。
 * - POST action:'get':后台会话 + 维护密码 → 返回完整状态(页面解锁校验)。
 * - POST action:'set_gallery_feature':同上双守卫 → 写
 *   blog_site_settings.gallery_feature_enabled → 返回新状态。
 * - 维护密码来源必须为环境变量(ADMIN_MAINTENANCE_PASSWORD /
 *   ADMIN_FULL_REDEPLOY_PASSWORD),均未配置 → 403「维护密码未配置」,
 *   不允许回退默认值解锁本页(先于任何密码比对判定)。
 */
type VersionRepairResponse = {
  success: boolean
  galleryFeatureEnabled?: boolean
  currentTheme?: string | null
  error?: string
}

const COLUMN_MISSING_HINT =
  '数据库尚未升级（gallery_feature_enabled 列缺失），请先执行迁移 021'

function isMissingColumnError(message: string): boolean {
  return (
    message.includes('gallery_feature_enabled') ||
    message.includes('PGRST204') ||
    message.includes('42703')
  )
}

/** 密码来源必须为环境变量:本页不允许回退默认维护密码解锁(与 maintenancePassword 的默认兜底隔离) */
function envMaintenancePasswordConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_MAINTENANCE_PASSWORD?.trim() ||
      process.env.ADMIN_FULL_REDEPLOY_PASSWORD?.trim()
  )
}

async function readState() {
  const [galleryFeatureEnabled, currentTheme] = await Promise.all([
    getGalleryFeatureEnabled(),
    getSiteThemeCode(),
  ])
  return { galleryFeatureEnabled, currentTheme }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VersionRepairResponse>
) {
  res.setHeader('Cache-Control', 'no-store')

  try {
    if (!getBlogSiteIdOrNull() || !getSupabaseAdmin()) {
      return res.status(503).json({ success: false, error: '站点配置不可用' })
    }

    if (req.method === 'GET') {
      if (!verifyAdminRequest(req)) {
        return res.status(401).json({ success: false, error: '未授权' })
      }
      return res.status(200).json({ success: true, ...(await readState()) })
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}

      if (!verifyAdminRequest(req)) {
        return res.status(401).json({ success: false, error: '未授权' })
      }
      if (!envMaintenancePasswordConfigured()) {
        return res.status(403).json({ success: false, error: '维护密码未配置' })
      }
      if (!verifyAdminMaintenancePassword(req, body)) {
        return res.status(403).json({ success: false, error: '维护密码错误' })
      }

      if (body.action === 'get') {
        return res.status(200).json({ success: true, ...(await readState()) })
      }

      if (body.action === 'set_gallery_feature') {
        const enabled = Boolean(body.enabled)
        try {
          await setGalleryFeatureEnabled(enabled)
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          if (isMissingColumnError(message)) {
            return res.status(500).json({ success: false, error: COLUMN_MISSING_HINT })
          }
          throw e
        }
        return res
          .status(200)
          .json({ success: true, galleryFeatureEnabled: enabled, currentTheme: await getSiteThemeCode() })
      }

      return res.status(400).json({ success: false, error: '不支持的请求' })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误'
    if (isMissingColumnError(message)) {
      return res.status(500).json({ success: false, error: COLUMN_MISSING_HINT })
    }
    if (message.includes('站点配置不可用')) {
      return res.status(503).json({ success: false, error: '站点配置不可用' })
    }
    return res.status(500).json({ success: false, error: message })
  }
}
