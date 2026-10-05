import { errors, importSPKI, jwtVerify } from 'jose'

/**
 * 站点会员 B1:读者通行证(中心验证服务签发的 EdDSA JWT)本地验签 + cookie 工具。
 * - 中心只发证不存读者数据;BLOG 服务端本地验签,不吃中心可用性;
 * - 验签失败语义(fail-closed)交调用方(session 状态机清 cookie / login 拒发);
 * - 函数内绝不打印 token 原文。
 */

export type MemberPassportKey = { kid: string; publicKeyPem: string }

/** 内置公钥常量(中心 S2 交付;SPKI DER sha256=
 *  a285aa4e5cb8c03ff3859ae3ebbee7e7c863d035d2a30c3ab5d0114c345c8cfc 供自检。
 *  轮换时数组加新项、旧项保留 ≥7 天宽限。 */
export const MEMBER_PASSPORT_KEYS: MemberPassportKey[] = [
  {
    kid: 'smk-202610',
    publicKeyPem: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAnDIUg/Hbs7ODIS3tHfegpWl39r9hpy9H4rEPjy7eQXE=
-----END PUBLIC KEY-----`,
  },
]

export const MEMBER_COOKIE_NAME = 'sm_session'
/** 7 天(与中心 TTL、cookie maxAge 上界一致) */
export const MEMBER_PASSPORT_TTL_SECONDS = 604800
/** 24h 心跳 */
export const MEMBER_HEARTBEAT_SECONDS = 86400
/** 验签宽限 = 中心同值 7 天(refresh 接受过期 ≤7d 的证件) */
export const MEMBER_PASSPORT_GRACE_SECONDS = 604800

const MEMBER_PASSPORT_ISSUER = 'pro-merchant-member'

export type MemberPassportClaims = {
  iss: 'pro-merchant-member'
  /** 站点 Host(归一化后) */
  aud: string
  /** 会员 id */
  sub: string
  /** 站点 service_id */
  sid: string
  /** session_version */
  ver: number
  iat: number
  exp: number
  purpose: 'passport'
  /** 会员到期(epoch 秒);null=无到期 */
  mexp: number | null
}

export type MemberPassportVerifyReason =
  | 'malformed' | 'bad_algorithm' | 'unknown_kid' | 'bad_signature'
  | 'expired' | 'bad_claims' | 'wrong_purpose' | 'sid_mismatch' | 'aud_mismatch'

export type MemberPassportVerifyResult =
  | { ok: true; claims: MemberPassportClaims }
  | { ok: false; reason: MemberPassportVerifyReason }

/** 测试辅助:覆盖内置公钥表(null=恢复内置) */
let memberPassportKeysOverrideForTest: MemberPassportKey[] | null = null

export function __setMemberPassportKeysForTest(
  keys: MemberPassportKey[] | null
): void {
  memberPassportKeysOverrideForTest = keys
}

/** base64url 段合法性(严格字符集,防宽松解码;段非空) */
const BASE64URL_SEGMENT_RE = /^[A-Za-z0-9_-]+$/

function decodeBase64UrlJson(segment: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

/** SPKI 导入缓存(按 PEM;importSPKI 返回 promise,缓存 promise 防重复解析) */
const spkiKeyCache = new Map<string, Promise<ReturnType<typeof importSPKI>>>()

function importSpkiCached(pem: string): Promise<ReturnType<typeof importSPKI>> {
  let keyPromise = spkiKeyCache.get(pem)
  if (!keyPromise) {
    keyPromise = importSPKI(pem, 'EdDSA')
    spkiKeyCache.set(pem, keyPromise)
    // 导入失败不缓存坏 promise,下次重试
    keyPromise.catch(() => spkiKeyCache.delete(pem))
  }
  return keyPromise
}

export async function verifyMemberPassport(
  token: string,
  opts: {
    host: string
    siteId: string
    nowSeconds?: number
    keys?: MemberPassportKey[]
  }
): Promise<MemberPassportVerifyResult> {
  try {
    if (typeof token !== 'string' || token.length === 0) {
      return { ok: false, reason: 'malformed' }
    }
    // 1. 三段校验:split('.') 长度 3、每段严格 base64url(防 '=' 填充等宽松解码)
    const segments = token.split('.')
    if (
      segments.length !== 3 ||
      !segments.every((segment) => BASE64URL_SEGMENT_RE.test(segment))
    ) {
      return { ok: false, reason: 'malformed' }
    }

    // 2. header 校验
    const header = decodeBase64UrlJson(segments[0])
    if (!header) return { ok: false, reason: 'malformed' }
    if (header.alg !== 'EdDSA') return { ok: false, reason: 'bad_algorithm' }
    if (header.typ !== 'JWT') return { ok: false, reason: 'malformed' }
    if (typeof header.kid !== 'string' || !header.kid) {
      return { ok: false, reason: 'malformed' }
    }
    const keyTable =
      opts.keys ?? memberPassportKeysOverrideForTest ?? MEMBER_PASSPORT_KEYS
    const key = keyTable.find((item) => item.kid === header.kid)
    if (!key || !key.publicKeyPem) {
      return { ok: false, reason: 'unknown_kid' }
    }

    // 3. jose 验签(EdDSA 钉死 + issuer + 宽限 clockTolerance)
    let payload: Record<string, unknown>
    try {
      const cryptoKey = await importSpkiCached(key.publicKeyPem)
      const verified = await jwtVerify(token, cryptoKey, {
        algorithms: ['EdDSA'],
        issuer: MEMBER_PASSPORT_ISSUER,
        clockTolerance: MEMBER_PASSPORT_GRACE_SECONDS,
      })
      payload = verified.payload as Record<string, unknown>
    } catch (error) {
      if (error instanceof errors.JWTExpired) {
        return { ok: false, reason: 'expired' }
      }
      if (error instanceof errors.JWSSignatureVerificationFailed) {
        return { ok: false, reason: 'bad_signature' }
      }
      return { ok: false, reason: 'malformed' }
    }

    // 4. claims 形状校验(照系统侧 S2 清单)
    if (payload.iss !== MEMBER_PASSPORT_ISSUER) {
      return { ok: false, reason: 'bad_claims' }
    }
    if (
      typeof payload.aud !== 'string' ||
      !payload.aud ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.sid !== 'string' ||
      !payload.sid
    ) {
      return { ok: false, reason: 'bad_claims' }
    }
    if (!isSafeInteger(payload.ver) || payload.ver < 1) {
      return { ok: false, reason: 'bad_claims' }
    }
    if (!isSafeInteger(payload.iat) || !isSafeInteger(payload.exp)) {
      return { ok: false, reason: 'bad_claims' }
    }
    if (payload.purpose !== 'passport') {
      return { ok: false, reason: 'wrong_purpose' }
    }
    if (payload.mexp !== undefined && payload.mexp !== null) {
      if (!isSafeInteger(payload.mexp)) {
        return { ok: false, reason: 'bad_claims' }
      }
    }

    const claims: MemberPassportClaims = {
      iss: MEMBER_PASSPORT_ISSUER,
      aud: payload.aud,
      sub: payload.sub,
      sid: payload.sid,
      ver: payload.ver,
      iat: payload.iat,
      exp: payload.exp,
      purpose: 'passport',
      mexp:
        payload.mexp === undefined || payload.mexp === null
          ? null
          : (payload.mexp as number),
    }

    // 5. 对象级校验
    if (claims.sid !== opts.siteId) {
      return { ok: false, reason: 'sid_mismatch' }
    }
    if (claims.aud !== opts.host) {
      return { ok: false, reason: 'aud_mismatch' }
    }

    // 6. 时间语义:宽限内 exp 已过不报错(claims 交调用方判定);
    //    仅超宽限(exp < now - 7d)报 expired(jose clockTolerance 已拦,此处为
    //    nowSeconds 注入时的等价手工兜底)。
    const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000)
    if (claims.exp < now - MEMBER_PASSPORT_GRACE_SECONDS) {
      return { ok: false, reason: 'expired' }
    }

    return { ok: true, claims }
  } catch {
    // 7. catch-all:任何异常一律 malformed;绝不打印 token
    return { ok: false, reason: 'malformed' }
  }
}

/** Host 归一化(与中心同规则):trim → 小写 → 去 :port → 去尾部 '.' */
export function normalizeMemberHost(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
}

function memberCookieSuffix(): string {
  return process.env.NODE_ENV === 'production' ? '; Secure' : ''
}

/** pages API 用:输出 Set-Cookie 字符串(httpOnly / lax / maxAge) */
export function buildMemberSetCookie(
  value: string,
  maxAgeSeconds: number
): string {
  return `${MEMBER_COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${memberCookieSuffix()}`
}

export function buildMemberClearCookie(): string {
  return `${MEMBER_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${memberCookieSuffix()}`
}

/**
 * R2-B5a:member_no 展示 cookie(非敏感、仅前台 chip 读取展示)。
 * - 非 HttpOnly(客户端读);Path/Max-Age/SameSite/Secure 与 sm_session 同规则;
 * - 与 sm_session 同生共死:清 sm_session 处必清 sm_member_no(反向不要求);
 * - 值经 encodeURIComponent(防分隔符/非 ASCII 破坏 Set-Cookie;读取侧 decode)。
 */
export const MEMBER_NO_COOKIE_NAME = 'sm_member_no'

export function buildMemberNoCookie(value: string): string {
  return `${MEMBER_NO_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=${MEMBER_PASSPORT_TTL_SECONDS}; SameSite=Lax${memberCookieSuffix()}`
}

export function buildMemberNoClearCookie(): string {
  return `${MEMBER_NO_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${memberCookieSuffix()}`
}
