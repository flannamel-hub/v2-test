/**
 * 站点会员 R1:/api/member/handoff(回跳自动登录)+ callCenterHandoffRedeem(独立 mapper)
 * + MemberCenter failed 提示行 predicate。
 * - 路由行为矩阵:405/门控/ticket 守卫/host/siteId/成功发证/中心错误族/验签失败/
 *   ?back 忽略/双头(no-store + no-referrer);
 * - mapper 形状族:ok:true 两态必有非空 passport、坏类型 bad_response、
 *   429 三路解析、ok:false 全族透传(invalid/expired/used/revoked)、网络 → unavailable;
 * - 公开仓红线:用例内不出现真实域名/密钥(占位 blog.example.com 等)。
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

// React 组件文件按 JSX 转译(babel preset 无 JSX;组件内含 tsx 语法)
require.extensions['.tsx'] = function transpileProjectTsx(module, filename) {
  const result = babel.transformFileSync(filename, {
    babelrc: false,
    configFile: false,
    presets: [
      [
        require.resolve('@babel/preset-typescript'),
        { isTSX: true, allExtensions: true },
      ],
      [
        require.resolve('@babel/preset-react'),
        { runtime: 'classic' },
      ],
      [
        require.resolve('@babel/preset-env'),
        { targets: { node: 'current' }, modules: 'commonjs' },
      ],
    ],
  })
  return module._compile(result.code, filename)
}

const handoffHandler = require('../src/pages/api/member/handoff.ts').default
const memberPassport = require('../src/lib/blog/memberPassport.ts')
const membershipGate = require('../src/lib/blog/membershipGate.ts')
const quotaStateLib = require('../src/lib/blog/quotaState.ts')
const { callCenterHandoffRedeem } = require('../src/lib/blog/memberCenterClient.ts')
const memberCenter = require('../src/components/member/MemberCenter.tsx')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']
delete require.extensions['.tsx']

const adminStub = require('./stubs/membership-admin-stub.cjs')
const blogSiteStub = require('./stubs/membership-blogsite-stub.cjs')

const SITE_ID = '11111111-2222-4333-8444-555555555555'
const HOST = 'blog.example.com'
const DAY = 86400
const FAILED_LOCATION = '/member?handoff=failed'

const { shouldShowHandoffFailedNotice, MEMBER_HANDOFF_FAILED_TEXT } = memberCenter

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

function createRequest({ method = 'GET', query, headers } = {}) {
  return {
    method,
    headers: headers !== undefined ? headers : { host: HOST },
    query: query ?? {},
  }
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
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
    end() {
      this.ended = true
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

function assertCommonHeaders(res) {
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.equal(res.headers['referrer-policy'], 'no-referrer')
}

// --- 路由:方法与门控 ------------------------------------------------------------------

test('handoff 非 GET → 405 + Allow: GET + {success:false} 形状 + 双头', async () => {
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const res = createResponse()
    await handoffHandler(createRequest({ method }), res)
    assert.equal(res.statusCode, 405)
    assert.equal(res.headers.allow, 'GET')
    assert.deepEqual(res.body, { success: false, error: 'method_not_allowed' })
    assertCommonHeaders(res)
  }
})

test('handoff 门控关(免费版)→ 302 / 且零中心调用', async () => {
  enableMembership({ plan: 'free' })
  const res = createResponse()
  await handoffHandler(createRequest({ query: { ticket: 'T-1' } }), res)
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, '/')
  assertCommonHeaders(res)
  assert.equal(fetchCalls.length, 0)
})

test('handoff 门控 null(未配置 Supabase)→ 302 / 不建会话', async () => {
  const res = createResponse()
  await handoffHandler(createRequest({ query: { ticket: 'T-1' } }), res)
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, '/')
  assert.equal(res.headers['set-cookie'], undefined)
  assert.equal(fetchCalls.length, 0)
})

// --- 路由:参数守卫 --------------------------------------------------------------------

test('handoff ticket 缺失/非字符串(数组)→ 302 failed 零中心调用', async () => {
  enableMembership()

  const missing = createResponse()
  await handoffHandler(createRequest({}), missing)
  assert.equal(missing.statusCode, 302)
  assert.equal(missing.headers.location, FAILED_LOCATION)
  assertCommonHeaders(missing)

  const arrayForm = createResponse()
  await handoffHandler(
    createRequest({ query: { ticket: ['T-1', 'T-2'] } }),
    arrayForm
  )
  assert.equal(arrayForm.statusCode, 302)
  assert.equal(arrayForm.headers.location, FAILED_LOCATION)

  assert.equal(fetchCalls.length, 0)
})

test('handoff ticket 超长(4097)→ 302 failed', async () => {
  enableMembership()
  const res = createResponse()
  await handoffHandler(
    createRequest({ query: { ticket: 'T'.repeat(4097) } }),
    res
  )
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, FAILED_LOCATION)
  assert.equal(fetchCalls.length, 0)
})

test('handoff host 缺失 → 302 failed 零中心调用', async () => {
  enableMembership()
  const res = createResponse()
  await handoffHandler(createRequest({ query: { ticket: 'T-1' }, headers: {} }), res)
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, FAILED_LOCATION)
  assert.equal(fetchCalls.length, 0)
})

test('handoff siteId null(防御分支,先查后调)→ 302 failed 票不白耗', async () => {
  enableMembership()
  // 门控链内部读 siteId 两次(quotaState + membershipGate 各一)返回 SITE_ID;
  // 路由自身的第三次读取(镜像 login.ts:58-61)返回 null → 命中防御分支
  const originalGetSiteId = blogSiteStub.getBlogSiteIdOrNull
  let calls = 0
  blogSiteStub.getBlogSiteIdOrNull = () => {
    calls += 1
    return calls <= 2 ? SITE_ID : null
  }

  try {
    const res = createResponse()
    await handoffHandler(createRequest({ query: { ticket: 'T-1' } }), res)
    assert.equal(res.statusCode, 302)
    assert.equal(res.headers.location, FAILED_LOCATION)
    assert.equal(fetchCalls.length, 0)
  } finally {
    blogSiteStub.getBlogSiteIdOrNull = originalGetSiteId
  }
})

// --- 路由:成功链 ----------------------------------------------------------------------

test('handoff 成功(active)→ Set-Cookie(sm_session/HttpOnly/Lax/Max-Age=604800)+ 302 /', async () => {
  enableMembership()
  const passport = makePassport()
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, {
        ok: true,
        status: 'active',
        passport,
        expires_at: '2026-11-05T00:00:00Z',
        member_no: 'M-001',
      })
    )

  const res = createResponse()
  await handoffHandler(
    createRequest({
      query: { ticket: 'T-1' },
      headers: { host: HOST, 'cf-connecting-ip': '203.0.113.7' },
    }),
    res
  )

  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, '/')
  assertCommonHeaders(res)
  assert.ok(res.headers['set-cookie'].startsWith(`sm_session=${passport}`))
  assert.match(res.headers['set-cookie'], /HttpOnly/)
  assert.match(res.headers['set-cookie'], /SameSite=Lax/)
  assert.match(res.headers['set-cookie'], /Path=\//)
  assert.match(res.headers['set-cookie'], /Max-Age=604800/)

  // 中心调用:endpoint + body {ticket, host, client_ip}
  assert.equal(fetchCalls.length, 1)
  const [url, init] = fetchCalls[0]
  assert.match(String(url), /\/api\/public\/site-member\/handoff-redeem$/)
  assert.deepEqual(JSON.parse(init.body), {
    ticket: 'T-1',
    host: HOST,
    client_ip: '203.0.113.7',
  })
})

test('handoff 成功:无读者 IP 头 → 中心 body 不含 client_ip', async () => {
  enableMembership()
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, {
        ok: true,
        status: 'active',
        passport: makePassport(),
        expires_at: null,
        member_no: null,
      })
    )
  const res = createResponse()
  await handoffHandler(createRequest({ query: { ticket: 'T-1' } }), res)
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, '/')
  const [, init] = fetchCalls[0]
  assert.deepEqual(JSON.parse(init.body), { ticket: 'T-1', host: HOST })
})

test('handoff 成功(expired 会员亦发证=续费链凭据)→ 302 / + Set-Cookie', async () => {
  enableMembership()
  const passport = makePassport({ mexp: null })
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, {
        ok: true,
        status: 'expired',
        passport,
        expires_at: '2026-09-05T00:00:00Z',
        member_no: 'M-001',
      })
    )
  const res = createResponse()
  await handoffHandler(createRequest({ query: { ticket: 'T-1' } }), res)
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, '/')
  assert.ok(res.headers['set-cookie'].startsWith(`sm_session=${passport}`))
})

test('handoff ?back=//evil 被忽略 → 302 /(Location 恒站内常量)', async () => {
  enableMembership()
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, {
        ok: true,
        status: 'active',
        passport: makePassport(),
        expires_at: null,
        member_no: null,
      })
    )
  const res = createResponse()
  await handoffHandler(
    createRequest({ query: { ticket: 'T-1', back: '//evil.example.com' } }),
    res
  )
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, '/')
  // back 不透传给中心
  assert.equal(JSON.parse(fetchCalls[0][1].body).back, undefined)
})

// --- 路由:失败落点(单一 failed)--------------------------------------------------------

test('handoff 中心 ok:false 全族(invalid/expired/used/revoked 抽样)→ 302 failed', async () => {
  enableMembership()
  for (const error of ['invalid', 'expired', 'used', 'revoked']) {
    fetchImpl = () => Promise.resolve(centerResponse(200, { ok: false, error }))
    const res = createResponse()
    await handoffHandler(createRequest({ query: { ticket: 'T-1' } }), res)
    assert.equal(res.statusCode, 302, error)
    assert.equal(res.headers.location, FAILED_LOCATION, error)
    assert.equal(res.headers['set-cookie'], undefined, error)
  }
})

test('handoff 中心 429 → 302 failed 且不透传 Retry-After(Q8)', async () => {
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
  await handoffHandler(createRequest({ query: { ticket: 'T-1' } }), res)
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, FAILED_LOCATION)
  assert.equal(res.headers['retry-after'], undefined)
  assertCommonHeaders(res)
})

test('handoff 中心 ok:true 但 passport 空 → bad_response → 302 failed(防御分支)', async () => {
  enableMembership()
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, { ok: true, status: 'active', passport: '', expires_at: null, member_no: null })
    )
  const res = createResponse()
  await handoffHandler(createRequest({ query: { ticket: 'T-1' } }), res)
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, FAILED_LOCATION)
})

test('handoff 本地验签失败(错 host 签发证)→ 302 failed', async () => {
  enableMembership()
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, {
        ok: true,
        status: 'active',
        passport: makePassport({ aud: 'other.example.net' }),
        expires_at: null,
        member_no: null,
      })
    )
  const res = createResponse()
  await handoffHandler(createRequest({ query: { ticket: 'T-1' } }), res)
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, FAILED_LOCATION)
  assert.equal(res.headers['set-cookie'], undefined)
})

test('handoff 中心网络失败 → 302 failed', async () => {
  enableMembership()
  fetchImpl = () => Promise.reject(new Error('network down'))
  const res = createResponse()
  await handoffHandler(createRequest({ query: { ticket: 'T-1' } }), res)
  assert.equal(res.statusCode, 302)
  assert.equal(res.headers.location, FAILED_LOCATION)
})

// --- callCenterHandoffRedeem 独立 mapper 形状族 ----------------------------------------

test('R1 mapper:ok:true 形状(active/expired 两态解析,expires_at/member_no 可空)', async () => {
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, {
        ok: true,
        status: 'active',
        passport: 'pp-1',
        expires_at: '2026-11-05T00:00:00Z',
        member_no: 'M-001',
      })
    )
  const active = await callCenterHandoffRedeem({ ticket: 'T', host: 'h.example', clientIp: null })
  assert.deepEqual(active, {
    ok: true,
    status: 'active',
    passport: 'pp-1',
    expiresAt: '2026-11-05T00:00:00Z',
    memberNo: 'M-001',
  })

  fetchImpl = () =>
    Promise.resolve(
      centerResponse(200, { ok: true, status: 'expired', passport: 'pp-2' })
    )
  const expired = await callCenterHandoffRedeem({ ticket: 'T', host: 'h.example', clientIp: null })
  assert.deepEqual(expired, {
    ok: true,
    status: 'expired',
    passport: 'pp-2',
    expiresAt: null,
    memberNo: null,
  })
})

test('R1 mapper:ok:true 坏类型族 → bad_response(status 越界/passport 缺或空或非串/可空字段坏类型)', async () => {
  const cases = [
    { ok: true, status: 'paused', passport: 'pp' },
    { ok: true, status: 'active' },
    { ok: true, status: 'active', passport: '' },
    { ok: true, status: 'active', passport: 42 },
    { ok: true, status: 'expired', passport: 'pp', expires_at: 99 },
    { ok: true, status: 'expired', passport: 'pp', member_no: {} },
  ]
  for (const body of cases) {
    fetchImpl = () => Promise.resolve(centerResponse(200, body))
    const result = await callCenterHandoffRedeem({ ticket: 'T', host: 'h.example', clientIp: null })
    assert.deepEqual(result, { ok: false, error: 'bad_response' }, JSON.stringify(body))
  }
})

test('R1 mapper:429 解析(body 优先/Retry-After 头兜底/默认 60/小数取整)', async () => {
  fetchImpl = () =>
    Promise.resolve(
      centerResponse(429, { ok: false, error: 'rate_limited', retry_after_seconds: 30 })
    )
  const fromBody = await callCenterHandoffRedeem({ ticket: 'T', host: 'h.example', clientIp: null })
  assert.equal(fromBody.error, 'rate_limited')
  assert.equal(fromBody.retryAfterSeconds, 30)

  fetchImpl = () =>
    Promise.resolve(centerResponse(429, { ok: false, error: 'rate_limited' }, { 'retry-after': '45' }))
  const fromHeader = await callCenterHandoffRedeem({ ticket: 'T', host: 'h.example', clientIp: null })
  assert.equal(fromHeader.retryAfterSeconds, 45)

  fetchImpl = () => Promise.resolve(centerResponse(429, null))
  const fallback = await callCenterHandoffRedeem({ ticket: 'T', host: 'h.example', clientIp: null })
  assert.equal(fallback.retryAfterSeconds, 60)

  fetchImpl = () =>
    Promise.resolve(centerResponse(429, { ok: false, error: 'rate_limited', retry_after_seconds: 12.9 }))
  const fractional = await callCenterHandoffRedeem({ ticket: 'T', host: 'h.example', clientIp: null })
  assert.equal(fractional.retryAfterSeconds, 12)
})

test('R1 mapper:ok:false 全族透传(invalid/expired/used/revoked);未知/坏形状 → bad_response', async () => {
  for (const error of ['invalid', 'expired', 'used', 'revoked']) {
    fetchImpl = () => Promise.resolve(centerResponse(200, { ok: false, error }))
    const result = await callCenterHandoffRedeem({ ticket: 'T', host: 'h.example', clientIp: null })
    assert.deepEqual(result, { ok: false, error }, error)
  }

  fetchImpl = () => Promise.resolve(centerResponse(200, { ok: false, error: 'something_else' }))
  const unknown = await callCenterHandoffRedeem({ ticket: 'T', host: 'h.example', clientIp: null })
  assert.deepEqual(unknown, { ok: false, error: 'bad_response' })

  fetchImpl = () => Promise.resolve(centerResponse(200, { ok: 'yes' }))
  const notOkField = await callCenterHandoffRedeem({ ticket: 'T', host: 'h.example', clientIp: null })
  assert.deepEqual(notOkField, { ok: false, error: 'bad_response' })
})

test('R1 mapper:非 JSON 5xx → unavailable;网络失败 → unavailable', async () => {
  fetchImpl = () => Promise.resolve(centerResponse(502, null))
  const nonJson = await callCenterHandoffRedeem({ ticket: 'T', host: 'h.example', clientIp: null })
  assert.deepEqual(nonJson, { ok: false, error: 'unavailable' })

  fetchImpl = () => Promise.reject(new Error('network down'))
  const netFail = await callCenterHandoffRedeem({ ticket: 'T', host: 'h.example', clientIp: null })
  assert.deepEqual(netFail, { ok: false, error: 'unavailable' })
})

// --- MemberCenter failed 提示行(predicate + 文案单源)----------------------------------

test('failed 提示行 predicate:isReady 且 handoff===failed 才显示(与三态视图无关)', () => {
  assert.equal(shouldShowHandoffFailedNotice(true, 'failed'), true)
  assert.equal(shouldShowHandoffFailedNotice(false, 'failed'), false)
  assert.equal(shouldShowHandoffFailedNotice(true, undefined), false)
  assert.equal(shouldShowHandoffFailedNotice(true, null), false)
  assert.equal(shouldShowHandoffFailedNotice(true, 'other'), false)
  assert.equal(shouldShowHandoffFailedNotice(true, ['failed']), false)
})

test('failed 提示行文案常量(§7 粗稿单源,T1 定稿)', () => {
  assert.equal(
    MEMBER_HANDOFF_FAILED_TEXT,
    '自动登录未完成。若已完成支付，可回到支付页再次点击返回；也可用购买邮件中的访问串登录。'
  )
})
