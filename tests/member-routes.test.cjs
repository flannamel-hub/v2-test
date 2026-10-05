const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const crypto = require('node:crypto')
const { after, beforeEach, test } = require('node:test')
const babel = require('@babel/core')

const repoRoot = path.resolve(__dirname, '..')
const srcRoot = `${path.join(repoRoot, 'src')}${path.sep}`
const originalResolveFilename = Module._resolveFilename
const originalJsLoader = require.extensions['.js']
const originalTsLoader = require.extensions['.ts']

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request === '@/src/lib/supabase/admin') {
    return path.join(__dirname, 'stubs', 'membership-admin-stub.cjs')
  }
  if (request === '@/src/lib/gallery/blogSite') {
    return path.join(__dirname, 'stubs', 'membership-blogsite-stub.cjs')
  }
  const resolvedRequest = request.startsWith('@/')
    ? path.join(repoRoot, request.slice(2))
    : request
  return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options)
}

require.extensions['.js'] = function transpileProjectJs(module, filename) {
  if (!filename.startsWith(srcRoot)) {
    return originalJsLoader(module, filename)
  }
  const result = babel.transformFileSync(filename, {
    babelrc: false,
    configFile: false,
    presets: [
      [
        require.resolve('@babel/preset-env'),
        { targets: { node: 'current' }, modules: 'commonjs' },
      ],
    ],
  })
  return module._compile(result.code, filename)
}

require.extensions['.ts'] = function transpileProjectTs(module, filename) {
  const result = babel.transformFileSync(filename, {
    babelrc: false,
    configFile: false,
    presets: [
      require.resolve('@babel/preset-typescript'),
      [
        require.resolve('@babel/preset-env'),
        { targets: { node: 'current' }, modules: 'commonjs' },
      ],
    ],
  })
  return module._compile(result.code, filename)
}

const loginHandler = require('../src/pages/api/member/login.ts').default
const sessionHandler = require('../src/pages/api/member/session.ts').default
const logoutHandler = require('../src/pages/api/member/logout.ts').default
const memberPassport = require('../src/lib/blog/memberPassport.ts')
const membershipGate = require('../src/lib/blog/membershipGate.ts')
const quotaStateLib = require('../src/lib/blog/quotaState.ts')
const { normalizeMemberAccessKey, resolveReaderClientIp } = require('../src/lib/blog/memberCenterClient.ts')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

const adminStub = require('./stubs/membership-admin-stub.cjs')
const blogSiteStub = require('./stubs/membership-blogsite-stub.cjs')

const SITE_ID = '11111111-2222-4333-8444-555555555555'
const HOST = 'blog.example.com'
const DAY = 86400

// --- Ed25519 测试钥对(经 __setMemberPassportKeysForTest 注入路由用验签表) ------------

const keyPair = crypto.generateKeyPairSync('ed25519')
const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' })
const privateKeyPem = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' })
const TEST_KID = 'test-key'
memberPassport.__setMemberPassportKeysForTest([
  { kid: TEST_KID, publicKeyPem },
])

function b64url(input) {
  return Buffer.from(input).toString('base64url')
}

function signJwt(header, claims) {
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  const signature = crypto.sign(
    null,
    Buffer.from(signingInput),
    crypto.createPrivateKey(privateKeyPem)
  )
  return `${signingInput}.${b64url(signature)}`
}

function makePassport(overrides = {}) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    { alg: 'EdDSA', typ: 'JWT', kid: TEST_KID },
    {
      iss: 'pro-merchant-member',
      aud: HOST,
      sub: 'member-001',
      sid: SITE_ID,
      ver: 3,
      iat: now - 60,
      exp: now + 6 * DAY,
      purpose: 'passport',
      mexp: now + 30 * DAY,
      ...overrides,
    }
  )
}

// --- 桩:supabase + 中心 fetch -----------------------------------------------------

function createFakeSupabase({ quotaRow, membershipRow } = {}) {
  const wrap = (value) => {
    const p = Promise.resolve(value)
    p.eq = () => p
    p.maybeSingle = () => p
    return p
  }
  return {
    from(table) {
      if (table === 'blog_quota_state') {
        return { select: () => wrap({ data: quotaRow ?? null, error: null }) }
      }
      return {
        select: () =>
          wrap({
            data: membershipRow !== undefined ? membershipRow : null,
            error: null,
          }),
      }
    },
  }
}

function enableMembership({ plan = 'pro', enabled = true } = {}) {
  adminStub.__setSupabaseClient(
    createFakeSupabase({
      quotaRow: { plan },
      membershipRow: {
        membership: {
          enabled,
          plans: [{ days: 30, price: 29, sku: 'MEM-30' }],
          copy: null,
        },
      },
    })
  )
  blogSiteStub.__setBlogSiteId(SITE_ID)
}

// --- fetch 间谍 -------------------------------------------------------------------

const originalFetch = global.fetch
let fetchCalls = []
let fetchImpl = null

function centerResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        if (name.toLowerCase() === 'retry-after') {
          return headers['retry-after'] !== undefined ? headers['retry-after'] : null
        }
        return null
      },
    },
    json: async () => body,
  }
}

// --- req/res 间谍 -----------------------------------------------------------------

function createRequest({ method = 'POST', body, headers, cookies } = {}) {
  return {
    method,
    headers: headers !== undefined ? headers : { host: HOST },
    cookies: cookies ?? {},
    body,
  }
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
}

beforeEach(() => {
  adminStub.__reset()
  blogSiteStub.__reset()
  membershipGate.__resetMembershipGateCacheForTest()
  quotaStateLib.invalidateSiteQuotaState()
  fetchCalls = []
  fetchImpl = null
  global.fetch = (...args) => {
    fetchCalls.push(args)
    if (fetchImpl) return fetchImpl(...args)
    return Promise.resolve(centerResponse(200, { ok: false, error: 'bad_response' }))
  }
})

after(() => {
  global.fetch = originalFetch
  memberPassport.__setMemberPassportKeysForTest(null)
})

// --- login:门控与参数 ------------------------------------------------------------

test('login 门控关(plan=free)→ 403 且零中心调用', async () => {
  enableMembership({ plan: 'free' })
  const res = createResponse()
  await loginHandler(createRequest({ body: { access_key: 'MEM-30' } }), res)

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, { success: false, error: 'disabled' })
  assert.equal(fetchCalls.length, 0)
})

test('login 门控关(未配置 membership)→ 403 且零中心调用', async () => {
  enableMembership()
  adminStub.__setSupabaseClient(
    createFakeSupabase({ quotaRow: { plan: 'pro' }, membershipRow: null })
  )
  const res = createResponse()
  await loginHandler(createRequest({ body: { access_key: 'MEM-30' } }), res)

  assert.equal(res.statusCode, 403)
  assert.equal(fetchCalls.length, 0)
})

test('login 非 POST → 405 + Allow', async () => {
  const res = createResponse()
  await loginHandler(createRequest({ method: 'GET' }), res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'POST')
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('login 参数校验:缺 access_key / 超长 / 规范化后为空 / 无 host → 400', async () => {
  enableMembership()

  const missing = createResponse()
  await loginHandler(createRequest({ body: {} }), missing)
  assert.equal(missing.statusCode, 400)
  assert.equal(missing.body.error, 'bad_request')

  const tooLong = createResponse()
  await loginHandler(
    createRequest({ body: { access_key: 'x'.repeat(65) } }),
    tooLong
  )
  assert.equal(tooLong.statusCode, 400)

  const emptyAfterNormalize = createResponse()
  await loginHandler(
    createRequest({ body: { access_key: ' - - ' } }),
    emptyAfterNormalize
  )
  assert.equal(emptyAfterNormalize.statusCode, 400)

  const noHost = createResponse()
  await loginHandler(
    createRequest({ body: { access_key: 'MEM-30' }, headers: {} }),
    noHost
  )
  assert.equal(noHost.statusCode, 400)

  assert.equal(fetchCalls.length, 0)
})

// --- login:中心结果映射 ------------------------------------------------------------

test('login ok → 200 + Set-Cookie(sm_session+sm_member_no 双下发,session 在前)', async () => {
  enableMembership()
  const passport = makePassport()
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, {
        ok: true,
        status: 'active',
        passport,
        expires_at: '2026-11-01T00:00:00.000Z',
        member_no: 'M001',
        masked: 'AB****CD',
      })
    )

  const res = createResponse()
  await loginHandler(
    createRequest({ body: { access_key: ' Mem-30 ' } }),
    res
  )

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, {
    success: true,
    status: 'active',
    member_no: 'M001',
    expires_at: '2026-11-01T00:00:00.000Z',
  })
  // R2-B5a(R4):Set-Cookie 为数组 [sm_session, sm_member_no](顺序固定)
  const loginCookies = [].concat(res.headers['set-cookie'])
  assert.deepEqual(loginCookies, [
    `sm_session=${passport}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax`,
    'sm_member_no=M001; Path=/; Max-Age=604800; SameSite=Lax',
  ])
  assert.equal(loginCookies.some((cookie) => cookie.includes('Secure')), false)
  // member_no 展示 cookie 非 HttpOnly
  assert.equal(loginCookies[1].includes('HttpOnly'), false)

  // 中心调用体:规范化后的 access_key + site_id + host
  assert.equal(fetchCalls.length, 1)
  const [url, init] = fetchCalls[0]
  assert.match(String(url), /\/api\/public\/site-member\/login$/)
  const sentBody = JSON.parse(init.body)
  assert.equal(sentBody.access_key, 'MEM30')
  assert.equal(sentBody.site_id, SITE_ID)
  assert.equal(sentBody.host, HOST)
})

test('login 中心 invalid → 200 error=invalid 且无 cookie', async () => {
  enableMembership()
  fetchImpl = () =>
    Promise.resolve(centerResponse(200, { ok: false, error: 'invalid' }))

  const res = createResponse()
  await loginHandler(createRequest({ body: { access_key: 'WRONG' } }), res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { success: false, error: 'invalid' })
  assert.equal(res.headers['set-cookie'], undefined)
})

test('login 中心 revoked → 200 error=revoked 且无 cookie', async () => {
  enableMembership()
  fetchImpl = () =>
    Promise.resolve(centerResponse(200, { ok: false, error: 'revoked' }))

  const res = createResponse()
  await loginHandler(createRequest({ body: { access_key: 'GONE' } }), res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { success: false, error: 'revoked' })
  assert.equal(res.headers['set-cookie'], undefined)
})

test('login 中心 429 → 429 + retry_after_seconds 透传 + Retry-After 头', async () => {
  enableMembership()
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(
        429,
        { ok: false, error: 'rate_limited', retry_after_seconds: 37 },
        { 'retry-after': '37' }
      )
    )

  const res = createResponse()
  await loginHandler(createRequest({ body: { access_key: 'MEM-30' } }), res)

  assert.equal(res.statusCode, 429)
  assert.equal(res.body.error, 'rate_limited')
  assert.equal(res.body.retry_after_seconds, 37)
  assert.equal(res.headers['retry-after'], '37')
})

test('login 中心 429 无 body 字段 → 解析 Retry-After 头兜底', async () => {
  enableMembership()
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(429, { ok: false, error: 'rate_limited' }, { 'retry-after': '45' })
    )

  const res = createResponse()
  await loginHandler(createRequest({ body: { access_key: 'MEM-30' } }), res)

  assert.equal(res.statusCode, 429)
  assert.equal(res.body.retry_after_seconds, 45)
})

test('login 网络失败(fetch reject)→ 503 unavailable', async () => {
  enableMembership()
  fetchImpl = () => Promise.reject(new Error('network down'))

  const res = createResponse()
  await loginHandler(createRequest({ body: { access_key: 'MEM-30' } }), res)

  assert.equal(res.statusCode, 503)
  assert.deepEqual(res.body, { success: false, error: 'unavailable' })
  assert.equal(res.headers['set-cookie'], undefined)
})

test('login 中心签发的证本地验不过(aud 不符)→ 503 且无 cookie', async () => {
  enableMembership()
  const badPassport = makePassport({ aud: 'other.example.com' })
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, {
        ok: true,
        status: 'active',
        passport: badPassport,
        expires_at: null,
        member_no: null,
        masked: null,
      })
    )

  const res = createResponse()
  await loginHandler(createRequest({ body: { access_key: 'MEM-30' } }), res)

  assert.equal(res.statusCode, 503)
  assert.deepEqual(res.body, { success: false, error: 'unavailable' })
  assert.equal(res.headers['set-cookie'], undefined)
})

// --- session 状态机 ---------------------------------------------------------------

test('session 门控关 → disabled(不动 cookie)', async () => {
  enableMembership({ plan: 'free' })
  const res = createResponse()
  await sessionHandler(
    createRequest({ method: 'GET', cookies: { sm_session: makePassport() } }),
    res
  )

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { status: 'disabled' })
  assert.equal(res.headers['set-cookie'], undefined)
  assert.equal(fetchCalls.length, 0)
})

test('session 无 cookie → guest', async () => {
  enableMembership()
  const res = createResponse()
  await sessionHandler(createRequest({ method: 'GET' }), res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { status: 'guest' })
  assert.equal(res.headers['set-cookie'], undefined)
})

test('session 坏 cookie → 清除双 Set-Cookie(session+member_no)+ guest', async () => {
  enableMembership()
  const res = createResponse()
  await sessionHandler(
    createRequest({ method: 'GET', cookies: { sm_session: 'garbage.token.here' } }),
    res
  )

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { status: 'guest' })
  // R2-B5a(R4):清 cookie 分支同时清 sm_member_no(数组归一断言)
  assert.deepEqual([].concat(res.headers['set-cookie']), [
    'sm_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    'sm_member_no=; Path=/; Max-Age=0; SameSite=Lax',
  ])
})

test('session 本地有效(iat 新鲜)→ active 且零中心调用 + touch 同值 cookie', async () => {
  enableMembership()
  const passport = makePassport()
  const res = createResponse()
  await sessionHandler(
    createRequest({ method: 'GET', cookies: { sm_session: passport } }),
    res
  )

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.status, 'active')
  assert.equal(res.body.member_no, null)
  assert.equal(typeof res.body.expires_at, 'string')
  assert.equal(
    res.headers['set-cookie'],
    `sm_session=${passport}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax`
  )
  assert.equal(fetchCalls.length, 0)
})

test('session iat=now-25h → 中心 refresh 被调 → active + 换写新 cookie', async () => {
  enableMembership()
  const now = Math.floor(Date.now() / 1000)
  const oldPassport = makePassport({ iat: now - 25 * 3600 })
  const newPassport = makePassport()
  fetchImpl = () => {
    const [url] = fetchCalls[fetchCalls.length - 1]
    assert.match(String(url), /\/api\/public\/site-member\/refresh$/)
    return Promise.resolve(
      centerResponse(200, {
        ok: true,
        status: 'active',
        passport: newPassport,
        expires_at: '2026-11-01T00:00:00.000Z',
        member_no: 'M001',
        masked: null,
      })
    )
  }

  const res = createResponse()
  await sessionHandler(
    createRequest({ method: 'GET', cookies: { sm_session: oldPassport } }),
    res
  )

  assert.equal(fetchCalls.length, 1)
  assert.equal(JSON.parse(fetchCalls[0][1].body).passport, oldPassport)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.status, 'active')
  assert.equal(res.body.member_no, 'M001')
  // R2-B5a(R4):refresh 换写 = 新 session + 补发 sm_member_no(中心返回 memberNo)
  assert.deepEqual([].concat(res.headers['set-cookie']), [
    `sm_session=${newPassport}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax`,
    'sm_member_no=M001; Path=/; Max-Age=604800; SameSite=Lax',
  ])
})

test('session mexp<=now 且中心回 expired → status=expired 且无 Set-Cookie(保留续费引用)', async () => {
  enableMembership()
  const now = Math.floor(Date.now() / 1000)
  const passport = makePassport({ mexp: now - 60 })
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, {
        ok: true,
        status: 'expired',
        expires_at: '2026-09-01T00:00:00.000Z',
        member_no: 'M001',
        masked: null,
      })
    )

  const res = createResponse()
  await sessionHandler(
    createRequest({ method: 'GET', cookies: { sm_session: passport } }),
    res
  )

  assert.equal(fetchCalls.length, 1)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.status, 'expired')
  assert.equal(res.body.member_no, 'M001')
  assert.equal(res.headers['set-cookie'], undefined)
})

test('session 中心 revoked → 清除 cookie + status=revoked(member_no 未知→null)', async () => {
  enableMembership()
  const now = Math.floor(Date.now() / 1000)
  const passport = makePassport({ iat: now - 25 * 3600 })
  fetchImpl = () =>
    Promise.resolve(centerResponse(200, { ok: false, error: 'revoked' }))

  const res = createResponse()
  await sessionHandler(
    createRequest({ method: 'GET', cookies: { sm_session: passport } }),
    res
  )

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.status, 'revoked')
  assert.equal(res.body.member_no, null)
  // R2-B5a(R4):revoked 清 cookie 分支同时清 sm_member_no
  assert.deepEqual([].concat(res.headers['set-cookie']), [
    'sm_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    'sm_member_no=; Path=/; Max-Age=0; SameSite=Lax',
  ])
})

test('session 中心网络失败 + 本地有效 → active + degraded:true + touch 同值', async () => {
  enableMembership()
  const now = Math.floor(Date.now() / 1000)
  const passport = makePassport({ iat: now - 25 * 3600, mexp: null })
  fetchImpl = () => Promise.reject(new Error('network down'))

  const res = createResponse()
  await sessionHandler(
    createRequest({ method: 'GET', cookies: { sm_session: passport } }),
    res
  )

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.status, 'active')
  assert.equal(res.body.degraded, true)
  assert.equal(
    res.headers['set-cookie'],
    `sm_session=${passport}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax`
  )
})

test('session 中心网络失败 + 本地已到期 → expired + degraded:true(不动 cookie)', async () => {
  enableMembership()
  const now = Math.floor(Date.now() / 1000)
  const passport = makePassport({ mexp: now - 60 })
  fetchImpl = () => Promise.reject(new Error('network down'))

  const res = createResponse()
  await sessionHandler(
    createRequest({ method: 'GET', cookies: { sm_session: passport } }),
    res
  )

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.status, 'expired')
  assert.equal(res.body.degraded, true)
  assert.equal(res.headers['set-cookie'], undefined)
})

test('session 非 GET → 405 + Allow GET', async () => {
  const res = createResponse()
  await sessionHandler(createRequest({ method: 'POST' }), res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'GET')
})

// --- logout -----------------------------------------------------------------------

test('logout → 清除双 cookie(session+member_no)+ success(不检门控/不调中心)', async () => {
  const res = createResponse()
  await logoutHandler(createRequest({}), res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { success: true })
  // R2-B5a(R4):与 sm_session 同生共死,一并清除
  assert.deepEqual([].concat(res.headers['set-cookie']), [
    'sm_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
    'sm_member_no=; Path=/; Max-Age=0; SameSite=Lax',
  ])
  assert.equal(fetchCalls.length, 0)
})

test('logout 非 POST → 405', async () => {
  const res = createResponse()
  await logoutHandler(createRequest({ method: 'GET' }), res)
  assert.equal(res.statusCode, 405)
})

// --- memberCenterClient 小工具 ------------------------------------------------------

test('normalizeMemberAccessKey:去空白/全角空格/各类连字符 + 大写', () => {
  assert.equal(normalizeMemberAccessKey(' mem-30 '), 'MEM30')
  assert.equal(normalizeMemberAccessKey('a b\u3000c-d－e–f—g'), 'ABCDEFG')
  assert.equal(normalizeMemberAccessKey(''), '')
})

test('resolveReaderClientIp:cf → xff 首段 → x-real-ip → null', () => {
  assert.equal(
    resolveReaderClientIp({ 'cf-connecting-ip': ' 1.1.1.1 ' }),
    '1.1.1.1'
  )
  assert.equal(
    resolveReaderClientIp({
      'cf-connecting-ip': 'not-an-ip',
      'x-forwarded-for': '2.2.2.2, 3.3.3.3',
    }),
    '2.2.2.2'
  )
  assert.equal(
    resolveReaderClientIp({ 'x-real-ip': [' 4.4.4.4 '] }),
    '4.4.4.4'
  )
  assert.equal(resolveReaderClientIp({}), null)
  assert.equal(resolveReaderClientIp({ 'x-forwarded-for': 'bogus' }), null)
})
