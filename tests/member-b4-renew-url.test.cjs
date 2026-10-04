/**
 * 站点会员 B4-W4:/api/member/renew-url + memberCenterClient.callCenterRenewRef(M6 独立 mapper)。
 * - 错误码全表(§10.3-6 / §10.2-Q3):401/403/429/503/400 族;
 * - URL 组装:store_url 以中心返回为准(禁硬编码)、sku 取 plans 档、renew_ref 过 encodeURIComponent;
 * - M6:独立 mapper 形状用例(ok:true 形状/坏类型 bad_response/429 Retry-After 兜底/ok:false 透传)。
 */
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

const renewUrlHandler = require('../src/pages/api/member/renew-url.ts').default
const memberPassport = require('../src/lib/blog/memberPassport.ts')
const membershipGate = require('../src/lib/blog/membershipGate.ts')
const quotaStateLib = require('../src/lib/blog/quotaState.ts')
const { callCenterRenewRef } = require('../src/lib/blog/memberCenterClient.ts')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

const adminStub = require('./stubs/membership-admin-stub.cjs')
const blogSiteStub = require('./stubs/membership-blogsite-stub.cjs')

const SITE_ID = '11111111-2222-4333-8444-555555555555'
const HOST = 'blog.example.com'
const DAY = 86400

// --- Ed25519 测试钥对 -----------------------------------------------------------------

const keyPair = crypto.generateKeyPairSync('ed25519')
const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' })
const privateKeyPem = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' })
const TEST_KID = 'test-key'
memberPassport.__setMemberPassportKeysForTest([{ kid: TEST_KID, publicKeyPem }])

function b64url(input) {
  return Buffer.from(input).toString('base64url')
}

function signJwt(header, claims) {
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  const signature = crypto.sign(null, Buffer.from(signingInput), crypto.createPrivateKey(privateKeyPem))
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

// --- 桩:supabase + 中心 fetch --------------------------------------------------------

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

function enableMembership({ plan = 'pro', plans } = {}) {
  adminStub.__setSupabaseClient(
    createFakeSupabase({
      quotaRow: { plan },
      membershipRow: {
        membership: {
          enabled: true,
          plans: plans ?? [
            { days: 30, price: 29, sku: 'MEM-30' },
            { days: 90, price: 79, sku: 'MEM/90' },
          ],
          copy: null,
        },
      },
    })
  )
  blogSiteStub.__setBlogSiteId(SITE_ID)
}

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

// --- 路由基础 --------------------------------------------------------------------------

test('renew-url 非 POST → 405 + Allow', async () => {
  const res = createResponse()
  await renewUrlHandler(createRequest({ method: 'GET' }), res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'POST')
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('renew-url 无 cookie → 401 guest 且零中心调用', async () => {
  enableMembership()
  const res = createResponse()
  await renewUrlHandler(createRequest({ body: { days: 30 } }), res)
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { success: false, error: 'guest' })
  assert.equal(fetchCalls.length, 0)
})

test('renew-url 门控关(免费版)→ 403 disabled 且零中心调用', async () => {
  enableMembership({ plan: 'free' })
  const res = createResponse()
  await renewUrlHandler(
    createRequest({ body: { days: 30 }, cookies: { sm_session: makePassport() } }),
    res
  )
  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, { success: false, error: 'disabled' })
  assert.equal(fetchCalls.length, 0)
})

test('renew-url days 非法/档不存在 → 400', async () => {
  enableMembership()
  const passport = makePassport()

  const missing = createResponse()
  await renewUrlHandler(
    createRequest({ body: {}, cookies: { sm_session: passport } }),
    missing
  )
  assert.equal(missing.statusCode, 400)

  const fractional = createResponse()
  await renewUrlHandler(
    createRequest({ body: { days: 30.5 }, cookies: { sm_session: passport } }),
    fractional
  )
  assert.equal(fractional.statusCode, 400)

  const notInPlans = createResponse()
  await renewUrlHandler(
    createRequest({ body: { days: 365 }, cookies: { sm_session: passport } }),
    notInPlans
  )
  assert.equal(notInPlans.statusCode, 400)
  assert.equal(fetchCalls.length, 0)
})

test('renew-url 坏 cookie(本地验签失败)→ 401 guest', async () => {
  enableMembership()
  const res = createResponse()
  await renewUrlHandler(
    createRequest({ body: { days: 30 }, cookies: { sm_session: 'garbage.token.here' } }),
    res
  )
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { success: false, error: 'guest' })
  assert.equal(fetchCalls.length, 0)
})

// --- 成功链 ----------------------------------------------------------------------------

test('renew-url 成功 → 200 url=中心 store_url + plans 内 sku + encodeURIComponent(renew_ref)', async () => {
  enableMembership()
  const passport = makePassport()
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, {
        ok: true,
        renew_ref: 'rEnew/Ref+99=',
        expires_in: 600,
        store_url: 'https://store.example.net/',
      })
    )

  const res = createResponse()
  await renewUrlHandler(
    createRequest({ body: { days: 30 }, cookies: { sm_session: passport } }),
    res
  )

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, {
    success: true,
    url: 'https://store.example.net/p/MEM-30?renew=rEnew%2FRef%2B99%3D',
  })

  // 中心调用:endpoint + body 恰 {passport}
  assert.equal(fetchCalls.length, 1)
  const [url, init] = fetchCalls[0]
  assert.match(String(url), /\/api\/public\/site-member\/renew-ref$/)
  assert.deepEqual(JSON.parse(init.body), { passport })
})

test('renew-url 成功:sku 含特殊字符亦过 encodeURIComponent(90 天档)', async () => {
  enableMembership()
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, {
        ok: true,
        renew_ref: 'RR-1',
        expires_in: null,
        store_url: 'https://store.example.net',
      })
    )
  const res = createResponse()
  await renewUrlHandler(
    createRequest({ body: { days: 90 }, cookies: { sm_session: makePassport() } }),
    res
  )
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.url, 'https://store.example.net/p/MEM%2F90?renew=RR-1')
})

// --- 中心错误映射(§10.3-6 / Q3) -------------------------------------------------------

test('renew-url 中心 invalid → 401', async () => {
  enableMembership()
  fetchImpl = () => Promise.resolve(centerResponse(200, { ok: false, error: 'invalid' }))
  const res = createResponse()
  await renewUrlHandler(
    createRequest({ body: { days: 30 }, cookies: { sm_session: makePassport() } }),
    res
  )
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { success: false, error: 'invalid' })
})

test('renew-url 中心 revoked → 403', async () => {
  enableMembership()
  fetchImpl = () => Promise.resolve(centerResponse(200, { ok: false, error: 'revoked' }))
  const res = createResponse()
  await renewUrlHandler(
    createRequest({ body: { days: 30 }, cookies: { sm_session: makePassport() } }),
    res
  )
  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, { success: false, error: 'revoked' })
})

test('renew-url 中心 rate_limited → 429 + Retry-After 头 + retry_after_seconds', async () => {
  enableMembership()
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(
        429,
        { ok: false, error: 'rate_limited', retry_after_seconds: 25 },
        { 'retry-after': '25' }
      )
    )
  const res = createResponse()
  await renewUrlHandler(
    createRequest({ body: { days: 30 }, cookies: { sm_session: makePassport() } }),
    res
  )
  assert.equal(res.statusCode, 429)
  assert.equal(res.body.error, 'rate_limited')
  assert.equal(res.body.retry_after_seconds, 25)
  assert.equal(res.headers['retry-after'], '25')
})

test('renew-url 中心 unavailable / bad_response / 网络失败 → 503(Q3 家族一致)', async () => {
  enableMembership()

  fetchImpl = () => Promise.resolve(centerResponse(200, { ok: false, error: 'unavailable' }))
  const unavailable = createResponse()
  await renewUrlHandler(
    createRequest({ body: { days: 30 }, cookies: { sm_session: makePassport() } }),
    unavailable
  )
  assert.equal(unavailable.statusCode, 503)
  assert.deepEqual(unavailable.body, { success: false, error: 'unavailable' })

  fetchImpl = () => Promise.resolve(centerResponse(200, { ok: true, renew_ref: '', store_url: 'https://s.example' }))
  const bad = createResponse()
  await renewUrlHandler(
    createRequest({ body: { days: 30 }, cookies: { sm_session: makePassport() } }),
    bad
  )
  assert.equal(bad.statusCode, 503)

  fetchImpl = () => Promise.reject(new Error('network down'))
  const netFail = createResponse()
  await renewUrlHandler(
    createRequest({ body: { days: 30 }, cookies: { sm_session: makePassport() } }),
    netFail
  )
  assert.equal(netFail.statusCode, 503)
})

test('renew-url 中心 store_url 非 http(s) → 503(组链护栏,§10.3-1)', async () => {
  enableMembership()
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, {
        ok: true,
        renew_ref: 'RR-1',
        expires_in: null,
        store_url: 'javascript:alert(1)',
      })
    )
  const res = createResponse()
  await renewUrlHandler(
    createRequest({ body: { days: 30 }, cookies: { sm_session: makePassport() } }),
    res
  )
  assert.equal(res.statusCode, 503)
  assert.deepEqual(res.body, { success: false, error: 'unavailable' })
})

// --- M6:callCenterRenewRef 独立 mapper 形状 -------------------------------------------

test('M6 mapper:ok:true 形状解析(renew_ref/store_url trim,expires_in 取整/null)', async () => {
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, {
        ok: true,
        renew_ref: '  RR-1  ',
        expires_in: 600.9,
        store_url: ' https://store.example.net/ ',
      })
    )
  const result = await callCenterRenewRef('passport-x')
  assert.deepEqual(result, {
    ok: true,
    renewRef: 'RR-1',
    expiresIn: 600,
    storeUrl: 'https://store.example.net/',
  })
  // 尾斜杠由路由组链时统一 strip(见成功链用例)
})

test('M6 mapper:expires_in 缺省/null → null', async () => {
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, { ok: true, renew_ref: 'R', store_url: 'https://s.example' })
    )
  const missing = await callCenterRenewRef('p')
  assert.equal(missing.ok, true)
  assert.equal(missing.expiresIn, null)

  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, { ok: true, renew_ref: 'R', expires_in: null, store_url: 'https://s.example' })
    )
  const nullValue = await callCenterRenewRef('p')
  assert.equal(nullValue.ok, true)
  assert.equal(nullValue.expiresIn, null)
})

test('M6 mapper:ok:true 坏类型(renew_ref/store_url 非串或空/过期字段非法)→ bad_response', async () => {
  const cases = [
    { ok: true, store_url: 'https://s.example' },
    { ok: true, renew_ref: '', store_url: 'https://s.example' },
    { ok: true, renew_ref: 'R' },
    { ok: true, renew_ref: 42, store_url: 'https://s.example' },
    { ok: true, renew_ref: 'R', store_url: 99 },
    { ok: true, renew_ref: 'R', store_url: 'https://s.example', expires_in: '600' },
  ]
  for (const body of cases) {
    fetchImpl = () => Promise.resolve(centerResponse(200, body))
    const result = await callCenterRenewRef('p')
    assert.deepEqual(result, { ok: false, error: 'bad_response' }, JSON.stringify(body))
  }
})

test('M6 mapper:429 无 body 字段 → Retry-After 头兜底(镜像 login 家族)', async () => {
  fetchImpl = () =>
    Promise.resolve(centerResponse(429, { ok: false, error: 'rate_limited' }, { 'retry-after': '45' }))
  const result = await callCenterRenewRef('p')
  assert.deepEqual(result, { ok: false, error: 'rate_limited', retryAfterSeconds: 45 })

  fetchImpl = () => Promise.resolve(centerResponse(429, null))
  const noHeader = await callCenterRenewRef('p')
  assert.deepEqual(noHeader, { ok: false, error: 'rate_limited', retryAfterSeconds: 60 })

  fetchImpl = () =>
    Promise.resolve(centerResponse(429, { ok: false, error: 'rate_limited', retry_after_seconds: 12.9 }))
  const fractional = await callCenterRenewRef('p')
  assert.equal(fractional.retryAfterSeconds, 12)
})

test('M6 mapper:ok:false 错误族透传(invalid/revoked/unavailable);未知 → bad_response', async () => {
  for (const error of ['invalid', 'revoked', 'unavailable']) {
    fetchImpl = () => Promise.resolve(centerResponse(200, { ok: false, error }))
    const result = await callCenterRenewRef('p')
    assert.deepEqual(result, { ok: false, error })
  }
  fetchImpl = () => Promise.resolve(centerResponse(200, { ok: false, error: 'something_else' }))
  const unknown = await callCenterRenewRef('p')
  assert.deepEqual(unknown, { ok: false, error: 'bad_response' })

  fetchImpl = () => Promise.resolve(centerResponse(200, { ok: 'yes' }))
  const notOkField = await callCenterRenewRef('p')
  assert.deepEqual(notOkField, { ok: false, error: 'bad_response' })
})

test('M6 mapper:非 JSON 5xx → unavailable;网络失败 → unavailable', async () => {
  fetchImpl = () => Promise.resolve(centerResponse(502, null))
  const nonJson = await callCenterRenewRef('p')
  assert.deepEqual(nonJson, { ok: false, error: 'unavailable' })

  fetchImpl = () => Promise.reject(new Error('network down'))
  const netFail = await callCenterRenewRef('p')
  assert.deepEqual(netFail, { ok: false, error: 'unavailable' })
})
