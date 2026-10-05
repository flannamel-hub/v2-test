import type { NextApiRequest, NextApiResponse } from 'next'
import { getEffectiveMembershipConfig } from '@/src/lib/blog/membershipGate'
import {
  callCenterHandoffRedeem,
  resolveReaderClientIp,
} from '@/src/lib/blog/memberCenterClient'
import {
  buildMemberNoCookie,
  buildMemberSetCookie,
  MEMBER_PASSPORT_TTL_SECONDS,
  normalizeMemberHost,
  verifyMemberPassport,
} from '@/src/lib/blog/memberPassport'
import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'

/**
 * 站点会员 R1:支付后回跳自动登录(GET 专用)。
 * - 票 URL 由中心拼装(`https://{canonicalHost}/api/member/handoff?ticket=…`);
 *   BLOG 不做本地票验签——中心单次消费即鉴权(信任链=TLS 服务间+中心 Ed25519);
 * - 成功:中心发证 → 本地 verifyMemberPassport → Set-Cookie(sm_session + sm_member_no)
 *   +302 /(固定首页);
 * - 一切失败(票非法/已用/过期、host 缺失、siteId 缺失、中心任何错误、验签失败)
 *   → 302 /pricing?handoff=failed(R2-B5a:/member 已退役为重定向,query 无法穿透,
 *   新落点=pricing 页;提示行由 PricingPageContent 渲染);
 * - 不实现 back:忽略一切 query 透传,Location 恒为站内常量(开放重定向面由构造消除);
 * - 全响应(含 302/405)带 Cache-Control: no-store + Referrer-Policy: no-referrer;
 * - 429 → 302 failed 不透传 Retry-After(用户面=重定向+提示行,无机器消费方)。
 * - 日志纪律:只打错误类别,绝不含 ticket / passport 原文。
 */

const FAILED_LOCATION = '/pricing?handoff=failed'

function redirectTo(res: NextApiResponse, location: string): void {
  res.setHeader('Location', location)
  res.status(302).end()
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res
      .status(405)
      .json({ success: false, error: 'method_not_allowed' })
  }

  try {
    // 门控 fail-closed:未开通/免费版 → 302 首页(不建会话、不耗票)
    const config = await getEffectiveMembershipConfig()
    if (!config) {
      return redirectTo(res, '/')
    }

    const ticket = req.query.ticket
    if (
      typeof ticket !== 'string' ||
      ticket.length === 0 ||
      ticket.length > 4096
    ) {
      return redirectTo(res, FAILED_LOCATION)
    }

    const host = normalizeMemberHost(
      String(req.headers['x-forwarded-host'] || req.headers.host || '')
    )
    if (!host) {
      return redirectTo(res, FAILED_LOCATION)
    }

    // 镜像 login.ts:58-61——中心调用之前先查 siteId(防御分支;票不白耗)
    const siteId = getBlogSiteIdOrNull()
    if (!siteId) {
      return redirectTo(res, FAILED_LOCATION)
    }

    const center = await callCenterHandoffRedeem({
      ticket,
      host,
      clientIp: resolveReaderClientIp(req.headers),
    })

    if (!center.ok) {
      // 只打错误类别(invalid/expired/used/revoked/rate_limited/unavailable/bad_response)
      console.error('[member] handoff redeem failed:', center.error)
      return redirectTo(res, FAILED_LOCATION)
    }
    if (!center.passport) {
      console.error('[member] handoff redeem ok without passport')
      return redirectTo(res, FAILED_LOCATION)
    }

    const verified = await verifyMemberPassport(center.passport, {
      host,
      siteId,
    })
    if (!verified.ok) {
      // 只打 reason,不打 token
      console.error('[member] handoff passport verify failed:', verified.reason)
      return redirectTo(res, FAILED_LOCATION)
    }

    // status='expired' 亦发 cookie:到期会员需要会话凭据走续费链(与 login 同语义)
    // R2-B5a:sm_member_no 展示 cookie 同步下发(顺序固定 session 在前)
    const setCookies = [
      buildMemberSetCookie(center.passport, MEMBER_PASSPORT_TTL_SECONDS),
    ]
    if (typeof center.memberNo === 'string' && center.memberNo) {
      setCookies.push(buildMemberNoCookie(center.memberNo))
    }
    res.setHeader('Set-Cookie', setCookies)
    return redirectTo(res, '/')
  } catch (error) {
    console.error(
      '[member] handoff error:',
      error instanceof Error ? error.message : error
    )
    return redirectTo(res, FAILED_LOCATION)
  }
}
