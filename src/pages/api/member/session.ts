import type { NextApiRequest, NextApiResponse } from 'next'
import { getEffectiveMembershipConfig } from '@/src/lib/blog/membershipGate'
import { callCenterRefresh } from '@/src/lib/blog/memberCenterClient'
import {
  buildMemberClearCookie,
  buildMemberNoClearCookie,
  buildMemberNoCookie,
  buildMemberSetCookie,
  MEMBER_COOKIE_NAME,
  MEMBER_HEARTBEAT_SECONDS,
  MEMBER_PASSPORT_TTL_SECONDS,
  normalizeMemberHost,
  verifyMemberPassport,
  type MemberPassportClaims,
} from '@/src/lib/blog/memberPassport'
import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'

/**
 * 站点会员 B1:会话状态 + 24h 心跳(本地验签,必要时调中心 refresh)。
 *
 * 语义备忘:
 * - iat 即「最近一次中心签发时刻」,用作「距上次中心核对」的代理;
 * - 滑动只滑 cookie maxAge,JWT exp 以中心为准;
 * - 中心不可达时不惩罚本地判有效的读者,撤销/续费最迟在中心恢复后 ≤24h 生效(已知边界);
 * - B4 前端对 session 的调用按页面挂载触发、不做高频轮询
 *   (心跳条件③对到期会员每次都会打到中心)。
 */

function memberNoFromClaims(_claims: MemberPassportClaims): null {
  // claims 冻结契约无 member_no 字段;纯本地路径 member_no 未知→null;
  // 权威值以 login/refresh 的中心返回为准
  return null
}

function expiresAtFromClaims(claims: MemberPassportClaims): string | null {
  return claims.mexp != null
    ? new Date(claims.mexp * 1000).toISOString()
    : null
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ success: false, error: 'method_not_allowed' })
  }

  try {
    // 状态 1:门控关 → 不动 cookie
    const config = await getEffectiveMembershipConfig()
    if (!config) {
      return res.status(200).json({ status: 'disabled' })
    }

    // 状态 2:无 cookie → guest
    const token =
      typeof req.cookies?.[MEMBER_COOKIE_NAME] === 'string'
        ? req.cookies[MEMBER_COOKIE_NAME]
        : null
    if (!token) {
      return res.status(200).json({ status: 'guest' })
    }

    // host 派生与 login 同规则;空 host / 空 siteId 按验签失败分支处理(清 cookie + guest)
    const host = normalizeMemberHost(
      String(req.headers['x-forwarded-host'] || req.headers.host || '')
    )
    const siteId = getBlogSiteIdOrNull()
    const verified =
      host && siteId
        ? await verifyMemberPassport(token, { host, siteId })
        : ({ ok: false as const, reason: 'aud_mismatch' as const })

    // 状态 3:验签失败 → 清除 cookie(含 member_no 展示 cookie)+ guest
    if (!verified.ok) {
      res.setHeader('Set-Cookie', [
        buildMemberClearCookie(),
        buildMemberNoClearCookie(),
      ])
      return res.status(200).json({ status: 'guest' })
    }
    const claims = verified.claims

    const now = Math.floor(Date.now() / 1000)
    const needsHeartbeat =
      now - claims.iat >= MEMBER_HEARTBEAT_SECONDS ||
      claims.exp - now < MEMBER_HEARTBEAT_SECONDS ||
      (claims.mexp !== null && claims.mexp <= now)

    // 状态 4:验签成功且无需心跳 → 重写同值 cookie(滑动 maxAge=7d)
    if (!needsHeartbeat) {
      res.setHeader(
        'Set-Cookie',
        buildMemberSetCookie(token, MEMBER_PASSPORT_TTL_SECONDS)
      )
      return res.status(200).json({
        status: 'active',
        member_no: memberNoFromClaims(claims),
        expires_at: expiresAtFromClaims(claims),
      })
    }

    // 状态 5:心跳 → 调中心 refresh
    const refresh = await callCenterRefresh(token)

    if (refresh.ok && refresh.status === 'active' && refresh.passport) {
      const reVerified = await verifyMemberPassport(refresh.passport, {
        host,
        siteId: siteId as string,
      })
      if (reVerified.ok) {
        // 换写新值(maxAge 7d);R2-B5a:中心 refresh 带 member_no 时
        // 同步补发 sm_member_no 展示 cookie(顺序固定 session 在前)
        const setCookies = [
          buildMemberSetCookie(refresh.passport, MEMBER_PASSPORT_TTL_SECONDS),
        ]
        if (typeof refresh.memberNo === 'string' && refresh.memberNo) {
          setCookies.push(buildMemberNoCookie(refresh.memberNo))
        }
        res.setHeader('Set-Cookie', setCookies)
        return res.status(200).json({
          status: 'active',
          member_no: refresh.memberNo ?? memberNoFromClaims(reVerified.claims),
          expires_at:
            refresh.expiresAt ?? expiresAtFromClaims(reVerified.claims),
        })
      }
      // 新证本地验不过:按降级处理(本地旧证仍有效则继续服务)
      console.error(
        '[member] refreshed passport verify failed:',
        reVerified.reason
      )
    }

    if (refresh.ok && refresh.status === 'expired') {
      // 保留 cookie(不删不滑):留作续费引用凭据
      return res.status(200).json({
        status: 'expired',
        member_no: refresh.memberNo ?? memberNoFromClaims(claims),
        expires_at: refresh.expiresAt ?? expiresAtFromClaims(claims),
      })
    }

    if (!refresh.ok && refresh.error === 'invalid') {
      res.setHeader('Set-Cookie', [
        buildMemberClearCookie(),
        buildMemberNoClearCookie(),
      ])
      return res.status(200).json({ status: 'guest' })
    }

    if (!refresh.ok && refresh.error === 'revoked') {
      res.setHeader('Set-Cookie', [
        buildMemberClearCookie(),
        buildMemberNoClearCookie(),
      ])
      return res.status(200).json({
        status: 'revoked',
        member_no: memberNoFromClaims(claims),
        expires_at: expiresAtFromClaims(claims),
      })
    }

    // 降级本地判定(中心 rate_limited / unavailable / bad_response / 新证验不过):
    // 本地 mexp===null || mexp > now → 视为 active(touch 同值);否则 expired(不动 cookie)
    const locallyActive = claims.mexp === null || claims.mexp > now
    if (locallyActive) {
      res.setHeader(
        'Set-Cookie',
        buildMemberSetCookie(token, MEMBER_PASSPORT_TTL_SECONDS)
      )
      return res.status(200).json({
        status: 'active',
        member_no: memberNoFromClaims(claims),
        expires_at: expiresAtFromClaims(claims),
        degraded: true,
      })
    }
    return res.status(200).json({
      status: 'expired',
      member_no: memberNoFromClaims(claims),
      expires_at: expiresAtFromClaims(claims),
      degraded: true,
    })
  } catch (error) {
    console.error(
      '[member] session error:',
      error instanceof Error ? error.message : error
    )
    return res.status(500).json({ status: 'guest', error: 'internal' })
  }
}
