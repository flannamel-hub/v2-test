import { isIP } from 'node:net'
import { resolveMerchantApiBase } from '@/src/lib/shop/merchantProducts'

/**
 * 站点会员 B1:中心验证服务(主站网关)调用 + 登录小工具。
 * - base 解析复用 merchantProducts.resolveMerchantApiBase(全仓唯一落点,不新增硬编码域);
 * - 错误语义:invalid/revoked 为中心 HTTP 200 + {ok:false,error}(不能只看状态码);
 * - 日志纪律:console 只打错误类别,绝不含 access_key / passport 原文。
 */

const CENTER_TIMEOUT_MS = 8000

/** 访问串规范化(与中心同规则):去空白/全角空格/各类连字符 → 大写 */
export function normalizeMemberAccessKey(raw: string): string {
  return (raw || '').replace(/[\s\u3000\-－–—]/g, '').toUpperCase()
}

function firstHeaderValue(
  value: string | string[] | undefined
): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null
  }
  if (typeof value === 'string') return value
  return null
}

/** 读者真实 IP 解析:cf-connecting-ip → x-forwarded-for 首段 → x-real-ip;非法/缺失 → null */
export function resolveReaderClientIp(
  headers: Record<string, string | string[] | undefined>
): string | null {
  const cf = firstHeaderValue(headers['cf-connecting-ip'])
  if (cf && isIP(cf.trim()) !== 0) return cf.trim()

  const xff = firstHeaderValue(headers['x-forwarded-for'])
  if (xff) {
    const first = String(xff.split(',')[0] || '').trim()
    if (first && isIP(first) !== 0) return first
  }

  const real = firstHeaderValue(headers['x-real-ip'])
  if (real && isIP(real.trim()) !== 0) return real.trim()

  return null
}

export type CenterMemberResult =
  | {
      ok: true
      status: 'active'
      passport: string
      expiresAt: string | null
      memberNo: string | null
      masked: string | null
    }
  | {
      ok: true
      status: 'expired'
      passport: string | null
      expiresAt: string | null
      memberNo: string | null
      masked: string | null
    }
  | {
      ok: false
      error: 'invalid' | 'revoked' | 'rate_limited' | 'unavailable' | 'bad_response'
      retryAfterSeconds?: number
    }

type CenterHttpResult = {
  status: number
  payload: unknown
  retryAfterHeader: string | null
}

async function postCenter(
  path: string,
  body: Record<string, unknown>,
  kind: 'login' | 'refresh'
): Promise<CenterHttpResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CENTER_TIMEOUT_MS)
  try {
    const res = await fetch(`${resolveMerchantApiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    let payload: unknown = null
    try {
      payload = await res.json()
    } catch {
      payload = null
    }
    return {
      status: res.status,
      payload,
      retryAfterHeader: res.headers.get('retry-after'),
    }
  } catch (e) {
    // 只打错误类别;绝不打印 access_key / passport
    console.error(`[member] center ${kind} failed: unavailable`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

function readNullableString(
  record: Record<string, unknown>,
  key: string
): { value: string | null; badType: boolean } {
  const raw = record[key]
  if (raw === undefined || raw === null) return { value: null, badType: false }
  if (typeof raw === 'string') return { value: raw, badType: false }
  return { value: null, badType: true }
}

function mapCenterResponse(
  kind: 'login' | 'refresh',
  http: CenterHttpResult
): CenterMemberResult {
  if (http.status === 429) {
    const body =
      http.payload && typeof http.payload === 'object'
        ? (http.payload as Record<string, unknown>)
        : null
    let retryAfterSeconds: number
    if (
      body &&
      typeof body.retry_after_seconds === 'number' &&
      Number.isFinite(body.retry_after_seconds) &&
      body.retry_after_seconds > 0
    ) {
      retryAfterSeconds = Math.floor(body.retry_after_seconds)
    } else {
      const header = Number(http.retryAfterHeader)
      retryAfterSeconds =
        Number.isFinite(header) && header > 0 ? Math.floor(header) : 60
    }
    return { ok: false, error: 'rate_limited', retryAfterSeconds }
  }

  if (!http.payload || typeof http.payload !== 'object') {
    // 非 JSON / 网络层已被上层 catch;此处兜底 5xx 非 JSON 等
    console.error(`[member] center ${kind} failed: unavailable`)
    return { ok: false, error: 'unavailable' }
  }
  const record = http.payload as Record<string, unknown>

  if (record.ok === true) {
    if (record.status !== 'active' && record.status !== 'expired') {
      console.error(`[member] center ${kind} failed: bad_response`)
      return { ok: false, error: 'bad_response' }
    }
    const expiresAt = readNullableString(record, 'expires_at')
    const memberNo = readNullableString(record, 'member_no')
    const masked = readNullableString(record, 'masked')
    if (expiresAt.badType || memberNo.badType || masked.badType) {
      console.error(`[member] center ${kind} failed: bad_response`)
      return { ok: false, error: 'bad_response' }
    }
    const passportRaw = record.passport
    if (
      passportRaw !== undefined &&
      passportRaw !== null &&
      typeof passportRaw !== 'string'
    ) {
      console.error(`[member] center ${kind} failed: bad_response`)
      return { ok: false, error: 'bad_response' }
    }
    const passport =
      typeof passportRaw === 'string' && passportRaw.length > 0
        ? passportRaw
        : null
    if (record.status === 'active') {
      if (!passport) {
        // active 必须带新证
        console.error(`[member] center ${kind} failed: bad_response`)
        return { ok: false, error: 'bad_response' }
      }
      return {
        ok: true,
        status: 'active',
        passport,
        expiresAt: expiresAt.value,
        memberNo: memberNo.value,
        masked: masked.value,
      }
    }
    // expired:login 形态带 passport(续费链会话凭据);refresh 形态无新证(置 null)
    return {
      ok: true,
      status: 'expired',
      passport,
      expiresAt: expiresAt.value,
      memberNo: memberNo.value,
      masked: masked.value,
    }
  }

  if (record.ok === false) {
    if (
      record.error === 'invalid' ||
      record.error === 'revoked' ||
      record.error === 'unavailable'
    ) {
      return { ok: false, error: record.error }
    }
    console.error(`[member] center ${kind} failed: bad_response`)
    return { ok: false, error: 'bad_response' }
  }

  console.error(`[member] center ${kind} failed: bad_response`)
  return { ok: false, error: 'bad_response' }
}

/** 中心登录:POST {base}/api/public/site-member/login */
export async function callCenterLogin(input: {
  siteId: string
  accessKey: string
  host: string
  clientIp: string | null
}): Promise<CenterMemberResult> {
  try {
    const http = await postCenter(
      '/api/public/site-member/login',
      {
        site_id: input.siteId,
        access_key: input.accessKey,
        host: input.host,
        ...(input.clientIp ? { client_ip: input.clientIp } : {}),
      },
      'login'
    )
    return mapCenterResponse('login', http)
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

/** 中心核对/换发:POST {base}/api/public/site-member/refresh(status='expired' 形态无新证) */
export async function callCenterRefresh(
  passport: string
): Promise<CenterMemberResult> {
  try {
    const http = await postCenter(
      '/api/public/site-member/refresh',
      { passport },
      'refresh'
    )
    return mapCenterResponse('refresh', http)
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}
