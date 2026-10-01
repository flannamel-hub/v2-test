import type { NextApiRequest, NextApiResponse } from 'next'
import { buildMemberClearCookie } from '@/src/lib/blog/memberPassport'

/**
 * 站点会员 B1:退出登录。
 * 不检门控、不调中心——清 cookie 恒安全(幂等、无信息泄露)。
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
  res.setHeader('Set-Cookie', buildMemberClearCookie())
  return res.status(200).json({ success: true })
}
