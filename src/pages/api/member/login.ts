import type { NextApiRequest, NextApiResponse } from 'next'
import { getEffectiveMembershipConfig } from '@/src/lib/blog/membershipGate'
import {
  callCenterLogin,
  normalizeMemberAccessKey,
  resolveReaderClientIp,
} from '@/src/lib/blog/memberCenterClient'
import {
  buildMemberSetCookie,
  MEMBER_PASSPORT_TTL_SECONDS,
  normalizeMemberHost,
  verifyMemberPassport,
} from '@/src/lib/blog/memberPassport'
import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'

/**
 * 站点会员 B1:读者登录(代理中心验证服务 + 本地验签 + 发 cookie)。
 * middleware 不覆盖本路径(设计如此),门控/参数校验在本路由内完成。
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

  try {
    // 门控:未开通/免费版一律 403,不做任何中心调用
    const config = await getEffectiveMembershipConfig()
    if (!config) {
      return res.status(403).json({ success: false, error: 'disabled' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const accessKeyRaw = body?.access_key
    if (
      typeof accessKeyRaw !== 'string' ||
      accessKeyRaw.length === 0 ||
      accessKeyRaw.length > 64
    ) {
      return res.status(400).json({ success: false, error: 'bad_request' })
    }
    const accessKey = normalizeMemberAccessKey(accessKeyRaw)
    if (!accessKey) {
      return res.status(400).json({ success: false, error: 'bad_request' })
    }

    const host = normalizeMemberHost(
      String(req.headers['x-forwarded-host'] || req.headers.host || '')
    )
    if (!host) {
      return res.status(400).json({ success: false, error: 'bad_request' })
    }

    const siteId = getBlogSiteIdOrNull()
    if (!siteId) {
      return res.status(403).json({ success: false, error: 'disabled' })
    }

    const center = await callCenterLogin({
      siteId,
      accessKey,
      host,
      clientIp: resolveReaderClientIp(req.headers),
    })

    if (!center.ok) {
      if (center.error === 'invalid') {
        return res.status(200).json({ success: false, error: 'invalid' })
      }
      if (center.error === 'revoked') {
        return res.status(200).json({ success: false, error: 'revoked' })
      }
      if (center.error === 'rate_limited') {
        const retryAfterSeconds = center.retryAfterSeconds ?? 60
        res.setHeader('Retry-After', String(retryAfterSeconds))
        return res.status(429).json({
          success: false,
          error: 'rate_limited',
          retry_after_seconds: retryAfterSeconds,
        })
      }
      // unavailable / bad_response
      return res.status(503).json({ success: false, error: 'unavailable' })
    }

    if (!center.passport) {
      // 中心 ok:true 但未发证(契约外形态):按不可用处理
      console.error('[member] center login ok without passport')
      return res.status(503).json({ success: false, error: 'unavailable' })
    }

    const verified = await verifyMemberPassport(center.passport, {
      host,
      siteId,
    })
    if (!verified.ok) {
      // 只打 reason,不打 token
      console.error('[member] passport verify failed:', verified.reason)
      return res.status(503).json({ success: false, error: 'unavailable' })
    }

    // status='expired' 仍发 cookie:到期会员需要会话凭据走续费链(文案由前端 B4 处理)
    res.setHeader(
      'Set-Cookie',
      buildMemberSetCookie(center.passport, MEMBER_PASSPORT_TTL_SECONDS)
    )
    return res.status(200).json({
      success: true,
      status: center.status,
      member_no: center.memberNo,
      expires_at: center.expiresAt,
    })
  } catch (error) {
    console.error(
      '[member] login error:',
      error instanceof Error ? error.message : error
    )
    return res.status(503).json({ success: false, error: 'unavailable' })
  }
}
