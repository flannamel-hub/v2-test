import type { NextApiRequest, NextApiResponse } from 'next'
import { getEffectiveMembershipConfig } from '@/src/lib/blog/membershipGate'
import { callCenterRenewRef } from '@/src/lib/blog/memberCenterClient'
import {
  MEMBER_COOKIE_NAME,
  normalizeMemberHost,
  verifyMemberPassport,
} from '@/src/lib/blog/memberPassport'
import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'

/**
 * 站点会员 B4-W4:续费直达链接组装。
 * 流程:cookie passport → 本地验签 → days 校验(plans 内取 sku)→ 中心 renew-ref
 * → 组链 {store_url}/p/{sku}?renew={renew_ref}(store 域以中心返回为准,禁硬编码)。
 * 错误码全表(§10.3-6):无 cookie/本地验签失败/中心 invalid → 401;中心 revoked → 403;
 * rate_limited → 429(Retry-After + retry_after_seconds);unavailable/bad_response/store_url
 * 异常 → 503;days 非法/档不存在 → 400。日志只打错误类别,绝不含 passport/renew_ref 原文。
 */

const STORE_URL_RE = /^https?:\/\//i

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
    const token =
      typeof req.cookies?.[MEMBER_COOKIE_NAME] === 'string'
        ? req.cookies[MEMBER_COOKIE_NAME]
        : null
    if (!token) {
      return res.status(401).json({ success: false, error: 'guest' })
    }

    const config = await getEffectiveMembershipConfig()
    if (!config) {
      return res.status(403).json({ success: false, error: 'disabled' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const days = body?.days
    if (typeof days !== 'number' || !Number.isInteger(days)) {
      return res.status(400).json({ success: false, error: 'bad_request' })
    }
    const plan = config.plans.find((item) => item.days === days)
    if (!plan) {
      return res.status(400).json({ success: false, error: 'bad_request' })
    }

    const host = normalizeMemberHost(
      String(req.headers['x-forwarded-host'] || req.headers.host || '')
    )
    const siteId = getBlogSiteIdOrNull()
    const verified =
      host && siteId
        ? await verifyMemberPassport(token, { host, siteId })
        : ({ ok: false as const, reason: 'aud_mismatch' as const })
    if (!verified.ok) {
      // 只打 reason,不打 token
      console.error('[member] renew-url passport verify failed:', verified.reason)
      return res.status(401).json({ success: false, error: 'guest' })
    }

    const center = await callCenterRenewRef(token)

    if (!center.ok) {
      if (center.error === 'invalid') {
        return res.status(401).json({ success: false, error: 'invalid' })
      }
      if (center.error === 'revoked') {
        return res.status(403).json({ success: false, error: 'revoked' })
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
      // unavailable / bad_response → 503(与 login 家族一致,§10.2-Q3)
      return res.status(503).json({ success: false, error: 'unavailable' })
    }

    // 组链护栏(§10.3-1):store_url 最小校验;renew_ref 必过 encodeURIComponent
    const storeUrl = center.storeUrl.replace(/\/+$/, '')
    if (!STORE_URL_RE.test(storeUrl)) {
      console.error('[member] renew-url invalid store_url from center')
      return res.status(503).json({ success: false, error: 'unavailable' })
    }
    const url = `${storeUrl}/p/${encodeURIComponent(plan.sku)}?renew=${encodeURIComponent(center.renewRef)}`
    return res.status(200).json({ success: true, url })
  } catch (error) {
    console.error(
      '[member] renew-url error:',
      error instanceof Error ? error.message : error
    )
    return res.status(503).json({ success: false, error: 'unavailable' })
  }
}
