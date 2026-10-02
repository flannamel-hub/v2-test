import type { NextApiRequest, NextApiResponse } from 'next'
import { getSiteQuotaState } from '@/src/lib/blog/quotaState'
import { getMembershipConfig } from '@/src/lib/blog/membershipGate'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'

/** 站点会员 B3:编辑器 member 块门控只读端点。
 * 仅 BLOG 后台浏览器(编辑器门控)调用;不含 plans/copy 明细。
 * enabled = 原始读(平台是否已为该站开通站点会员,不含 plan 双门;fail-closed);
 * 前端 canAdd 判定 = plan==='pro' && enabled===true。
 * 路由内鉴权(middleware matcher 不等于鉴权——AGENTS §21 约定)。 */
type MembershipStateResponse = {
  success: boolean
  plan?: 'free' | 'pro'
  enabled?: boolean
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MembershipStateResponse>
) {
  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ success: false, error: '未授权' })
  }

  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ success: false, error: 'Method not allowed' })
    }

    const [quotaState, config] = await Promise.all([
      getSiteQuotaState(),
      getMembershipConfig(),
    ])
    return res.status(200).json({
      success: true,
      plan: quotaState.plan,
      enabled: !!config,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务端错误'
    return res.status(500).json({ success: false, error: message })
  }
}
