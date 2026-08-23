import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  encodeAdminAuthCookie,
  getAdminCredentials,
  isLegacyUrlPasswordDisabled,
  verifyAdminLoginToken,
} from '@/src/lib/admin/loginToken'

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
  matcher: ['/admin/:path*', '/admin', '/api/admin/:path*'],
}
