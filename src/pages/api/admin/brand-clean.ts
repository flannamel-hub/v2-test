import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'
import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { getSiteQuotaState } from '@/src/lib/blog/quotaState'

/** BLOG 分层 P8:「去除平台角标」商户开关(共用库 blog_quota_state.brand_clean)。
 * - GET:读取当前开关与站点 plan(后台展示);
 * - POST:仅专业版可开启/关闭;免费版一律 403(前台渲染也按双条件收敛);
 * - 仅写 brand_clean 一列(存在行时 update,无行时插入默认行),
 *   不触碰 read_only / status / plan / 用量列(主站 cron 拥有权威)。
 * middleware 不拦截本路径(不在商户写路径清单);鉴权口径与 vending/公告一致。 */

type BrandCleanResponse = {
  success: boolean
  enabled?: boolean
  plan?: 'free' | 'pro'
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BrandCleanResponse>
) {
  try {
    const siteId = getBlogSiteIdOrNull()
    const supabase = getSupabaseAdmin()
    if (!siteId || !supabase) {
      return res.status(503).json({ success: false, error: '站点配置不可用' })
    }

    if (req.method === 'GET') {
      const state = await getSiteQuotaState()
      return res
        .status(200)
        .json({ success: true, enabled: state.brandClean, plan: state.plan })
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
      if (typeof body.enabled !== 'boolean') {
        return res
          .status(400)
          .json({ success: false, error: '参数无效：enabled 必须为布尔值' })
      }

      const state = await getSiteQuotaState()
      if (state.plan !== 'pro') {
        return res.status(403).json({
          success: false,
          error: '去除平台角标为专业版权益，升级后可用',
        })
      }

      const { data: updated, error: updateError } = await supabase
        .from('blog_quota_state')
        .update({ brand_clean: body.enabled, updated_at: new Date().toISOString() })
        .eq('site_id', siteId)
        .select('brand_clean')
        .maybeSingle()

      if (updateError) {
        return res
          .status(500)
          .json({ success: false, error: '保存失败：' + updateError.message })
      }

      // 站点尚无状态行(P3 cron 未写入)时插入仅含默认值的行
      if (!updated) {
        const { error: insertError } = await supabase
          .from('blog_quota_state')
          .upsert(
            { site_id: siteId, brand_clean: body.enabled },
            { onConflict: 'site_id' }
          )
        if (insertError) {
          return res
            .status(500)
            .json({ success: false, error: '保存失败：' + insertError.message })
        }
      }

      return res
        .status(200)
        .json({ success: true, enabled: body.enabled, plan: 'pro' })
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
