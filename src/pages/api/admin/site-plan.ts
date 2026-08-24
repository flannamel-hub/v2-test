import type { NextApiRequest, NextApiResponse } from 'next'
import { getSiteQuotaState } from '@/src/lib/blog/quotaState'

/** BLOG 分层 P4-FIX:站点会员计划只读端点。
 * 仅 BLOG 后台浏览器调用(广告位管理灰态判定);只返回 plan,不含用量明细。 */
type SitePlanResponse = {
  success: boolean
  plan?: 'free' | 'pro'
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SitePlanResponse>
) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ success: false, error: 'Method not allowed' })
    }

    const state = await getSiteQuotaState()
    return res.status(200).json({ success: true, plan: state.plan })
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务端错误'
    return res.status(500).json({ success: false, error: message })
  }
}
