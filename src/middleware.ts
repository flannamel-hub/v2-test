import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  encodeAdminAuthCookie,
  getAdminCredentials,
  isLegacyUrlPasswordDisabled,
  verifyAdminLoginToken,
} from '@/src/lib/admin/loginToken'

// ---------------------------------------------------------------------------
// BLOG 分层 P2:页面 PV 计数(尽力而为,任何失败不得影响响应)
// - 站点级进程内 buffer(同一 worker 实例内共享);累计 50 次或距上次 flush
//   超 60 秒时,fire-and-forget 上报 /api/internal/pv-flush(不 await)。
//   edge 下 promise 被取消的丢弃可接受(设计已留 20% 安全边际)。
// - 排除 /_next、/api、/admin、/favicon 前缀与常见静态资源后缀。
// - 未配置 BLOG_SITE_ID(本地/单租户)时整体跳过。
// ---------------------------------------------------------------------------
const PV_SITE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PV_FLUSH_THRESHOLD = 50
const PV_FLUSH_INTERVAL_MS = 60_000
const PV_EXCLUDED_PREFIXES = ['/_next', '/api', '/admin', '/favicon']
const PV_EXCLUDED_SUFFIXES = [
  '.css',
  '.js',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.txt',
  '.json',
  '.woff',
  '.woff2',
]

const pvBuffer = new Map<string, number>()
let pvLastFlushAt: number | null = null

function shouldCountPv(pathname: string): boolean {
  const lower = pathname.toLowerCase()
  if (PV_EXCLUDED_PREFIXES.some((prefix) => lower.startsWith(prefix))) return false
  return !PV_EXCLUDED_SUFFIXES.some((suffix) => lower.endsWith(suffix))
}

function flushPvBuffer(siteId: string, origin: string): void {
  const count = pvBuffer.get(siteId) || 0
  pvBuffer.delete(siteId)
  pvLastFlushAt = Date.now()
  if (count <= 0) return
  void fetch(`${origin}/api/internal/pv-flush`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ site_id: siteId, count }),
  }).catch(() => {
    // 上报失败直接丢弃,不补偿、不重试
  })
}

function recordPv(pathname: string, origin: string): void {
  const siteId = process.env.BLOG_SITE_ID?.trim()
  if (!siteId || !PV_SITE_ID_RE.test(siteId)) return
  if (!shouldCountPv(pathname)) return

  const current = (pvBuffer.get(siteId) || 0) + 1
  pvBuffer.set(siteId, current)
  const now = Date.now()
  if (pvLastFlushAt === null) pvLastFlushAt = now
  if (
    current >= PV_FLUSH_THRESHOLD ||
    now - pvLastFlushAt >= PV_FLUSH_INTERVAL_MS
  ) {
    flushPvBuffer(siteId, origin)
  }
}

function credentialsMatch(user: string, pass: string): boolean {
  const { user: validUser, pass: validPass } = getAdminCredentials()
  return user === validUser && pass === validPass
}

function setAdminSessionCookie(response: NextResponse, user: string, pass: string) {
  response.cookies.set('internal_auth', encodeAdminAuthCookie(user, pass), {
    path: '/',
    maxAge: 86400,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
}

function redirectToAdminWithoutLoginQuery(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone()
  url.pathname = '/admin'
  url.searchParams.delete('login_token')
  url.searchParams.delete('auth_u')
  url.searchParams.delete('auth_p')
  return NextResponse.redirect(url)
}

function unauthorized(): NextResponse {
  return new NextResponse(null, {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Secure Area"',
    },
  })
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  // PV 计数:尽力而为,任何异常都不影响响应
  try {
    recordPv(pathname, req.nextUrl.origin)
  } catch {
    // ignore
  }

  if (pathname.startsWith('/admin')) {
    const loginToken = searchParams.get('login_token')

    if (loginToken) {
      const result = await verifyAdminLoginToken(loginToken, req.nextUrl.host)
      if (!result.ok) {
        console.warn('admin login_token rejected:', result.reason)
        return unauthorized()
      }

      const { user, pass } = getAdminCredentials()
      const response = redirectToAdminWithoutLoginQuery(req)
      setAdminSessionCookie(response, user, pass)
      return response
    }

    if (!isLegacyUrlPasswordDisabled()) {
      const auth_u = searchParams.get('auth_u')
      const auth_p = searchParams.get('auth_p')

      if (auth_u && auth_p && credentialsMatch(auth_u, auth_p)) {
        const { user, pass } = getAdminCredentials()
        const response = redirectToAdminWithoutLoginQuery(req)
        setAdminSessionCookie(response, user, pass)
        return response
      }
    }

    const basicAuth = req.headers.get('authorization')
    const cookieAuth = req.cookies.get('internal_auth')?.value

    if (basicAuth) {
      const authValue = basicAuth.split(' ')[1]
      if (authValue) {
        const [user, pwd] = atob(authValue).split(':')
        if (credentialsMatch(user, pwd)) return NextResponse.next()
      }
    }

    if (cookieAuth) {
      const [user, pwd] = atob(cookieAuth).split(':')
      if (credentialsMatch(user, pwd)) return NextResponse.next()
    }

    return unauthorized()
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/admin',
    '/api/admin/:path*',
    // PV 计量需要覆盖前台页面请求;api/_next/admin/favicon 仍被排除,
    // 静态资源后缀由 recordPv 内部再过滤一次
    '/((?!api|_next|admin|favicon).*)',
  ],
}
