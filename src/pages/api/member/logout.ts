import type { NextApiRequest, NextApiResponse } from 'next'
import {
  buildMemberClearCookie,
  buildMemberNoClearCookie,
} from '@/src/lib/blog/memberPassport'

/**
 * 站点会员 B1:退出登录。
 * 不检门控、不调中心——清 cookie 恒安全(幂等、无信息泄露)。
 * R2-B5a:sm_member_no 展示 cookie 与 sm_session 同生共死,一并清除。
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'method_not_allowed' })
  }
  res.setHeader('Set-Cookie', [
    buildMemberClearCookie(),
    buildMemberNoClearCookie(),
  ])
  return res.status(200).json({ success: true })
}
