import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'
import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { verifyAdminMaintenancePassword } from '@/src/lib/admin/maintenancePassword'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'

/** P14:BLOG 内容保护开关(全主题;blog_site_settings.content_protect)。
 * - GET:公开只读,读者端 _app 挂载后拉取;未配置 Supabase/018 未执行时安全缺省 false;
 * - POST:需登录态(Basic/Cookie);维护密码豁免保留(平台侧同步),参照 brand-clean 口径;
 * - 写库仅写 content_protect 一列(存在行时 update,无行时 upsert 默认行),
 *   不触碰 theme_code / last_full_redeploy_at 等其余列;
 * - middleware 不拦截本路径(与 brand-clean 一致,由路由内鉴权)。 */

type ContentProtectResponse = {
  success: boolean
  enabled?: boolean
  error?: string
}

const TABLE = 'blog_site_settings'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ContentProtectResponse>
) {
  try {
    if (req.method === 'GET') {
      const siteId = getBlogSiteIdOrNull()
      const supabase = getSupabaseAdmin()
      let enabled = false
      if (siteId && supabase) {
        const { data, error } = await supabase
          .from(TABLE)
          .select('content_protect')
          .eq('site_id', siteId)
          .maybeSingle()
        // 018 未执行(列缺失)或行不存在时降级为 false,读者端零副作用
        if (!error && data && data.content_protect != null) {
          enabled = Boolean(data.content_protect)
        } else if (error && !/content_protect/i.test(error.message || '')) {
          console.warn('[content-protect] read failed:', error.message)
        }
      }
      return res
        .setHeader('Cache-Control', 'no-store')
        .status(200)
        .json({ success: true, enabled })
    }

    if (req.method === 'POST') {
      const siteId = getBlogSiteIdOrNull()
      const supabase = getSupabaseAdmin()
      if (!siteId || !supabase) {
        return res.status(503).json({ success: false, error: '站点配置不可用' })
      }

      const body =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
      // P14:浏览器后台保存需登录态(Basic/Cookie);维护密码豁免保留(平台侧同步)
      if (!verifyAdminRequest(req) && !verifyAdminMaintenancePassword(req, body)) {
        return res.status(401).json({ success: false, error: '未授权' })
      }
      if (typeof body.enabled !== 'boolean') {
        return res
          .status(400)
          .json({ success: false, error: '参数无效：enabled 必须为布尔值' })
      }

      const now = new Date().toISOString()
      const { data: updated, error: updateError } = await supabase
        .from(TABLE)
        .update({ content_protect: body.enabled, updated_at: now })
        .eq('site_id', siteId)
        .select('content_protect')
        .maybeSingle()

      if (updateError) {
        if (/content_protect/i.test(updateError.message || '')) {
          return res.status(500).json({
            success: false,
            error: '数据库尚未升级（content_protect 列缺失），请先执行迁移 018',
          })
        }
        return res
          .status(500)
          .json({ success: false, error: '保存失败：' + updateError.message })
      }

      // 站点尚无设置行(未切换过主题等)时插入仅含默认值的行
      if (!updated) {
        const { error: upsertError } = await supabase
          .from(TABLE)
          .upsert(
            { site_id: siteId, content_protect: body.enabled, updated_at: now },
            { onConflict: 'site_id' }
          )
        if (upsertError) {
          return res
            .status(500)
            .json({ success: false, error: '保存失败：' + upsertError.message })
        }
      }

      return res.status(200).json({ success: true, enabled: body.enabled })
    }

    return res
      .setHeader('Allow', 'GET, POST')
      .status(405)
      .json({ success: false, error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务端错误'
    return res.status(500).json({ success: false, error: message })
  }
}
