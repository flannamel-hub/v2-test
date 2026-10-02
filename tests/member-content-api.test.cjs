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
  if (request === '@/src/lib/blog/format/block') {
    return path.join(__dirname, 'stubs', 'member-content-format-stub.cjs')
  }
  if (request === '@/src/lib/notion/getBlogData') {
    return path.join(__dirname, 'stubs', 'member-content-getblogdata-stub.cjs')
  }
  if (request === '@/src/lib/notion/getBlocks') {
    return path.join(__dirname, 'stubs', 'member-content-getblocks-stub.cjs')
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

const contentHandler = require('../src/pages/api/member/content.ts').default
const memberPassport = require('../src/lib/blog/memberPassport.ts')
const membershipGate = require('../src/lib/blog/membershipGate.ts')
const quotaStateLib = require('../src/lib/blog/quotaState.ts')
const memberContentCacheLib = require('../src/lib/blog/memberContentCache.ts')
const { computeMemberContentEtag, invalidateMemberContentCache, clearMemberContentCache } =
  memberContentCacheLib

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

const adminStub = require('./stubs/membership-admin-stub.cjs')
const blogSiteStub = require('./stubs/membership-blogsite-stub.cjs')
const getBlogDataStub = require('./stubs/member-content-getblogdata-stub.cjs')
const getBlocksStub = require('./stubs/member-content-getblocks-stub.cjs')

const SITE_ID = '11111111-2222-4333-8444-555555555555'
const HOST = 'blog.example.com'
const DAY = 86400
const SLUG = 'post-member-a'

// --- Ed25519 测试钥对 -----------------------------------------------------------------

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

// --- 夹具 -----------------------------------------------------------------------------

function para(id, text) {
  return {
    id,
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', plain_text: text }] },
    children: [],
  }
}

const PUBLIC_A = para('p1', 'PUBLIC_INTRO')
const MARKER_BLOCK = {
  id: 'm1',
  type: 'callout',
  callout: { rich_text: [{ type: 'text', plain_text: 'MEMBER:' }], color: 'gray_background' },
  children: [para('mc', 'MARKER_CHILD')],
}
const SECRET_A = para('s1', 'MEMBER_SECRET_A')
const SECRET_B = para('s2', 'MEMBER_SECRET_B')
const HAPPY_BLOCKS = [PUBLIC_A, MARKER_BLOCK, SECRET_A, SECRET_B]
const EXPECTED_MEMBER_BLOCKS = [SECRET_A, SECRET_B]

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
          plans: [
            { days: 30, price: 29, sku: 'MEM-30' },
            { days: 90, price: 79, sku: 'MEM-90' },
          ],
          copy: null,
        },
      },
    })
  )
  blogSiteStub.__setBlogSiteId(SITE_ID)
}

// --- req/res 间谍 ---------------------------------------------------------------------

function createRequest({
  method = 'GET',
  query,
  headers,
  cookies,
  ifNoneMatch,
} = {}) {
  const resolvedHeaders =
    headers !== undefined ? headers : { host: HOST }
  if (ifNoneMatch !== undefined) {
    resolvedHeaders['if-none-match'] = ifNoneMatch
  }
  return {
    method,
    headers: resolvedHeaders,
    cookies: cookies ?? {},
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

// --- 生命周期 -------------------------------------------------------------------------

beforeEach(() => {
  adminStub.__reset()
  blogSiteStub.__reset()
  getBlogDataStub.__reset()
  getBlocksStub.__reset()
  membershipGate.__resetMembershipGateCacheForTest()
  quotaStateLib.invalidateSiteQuotaState()
  clearMemberContentCache()
})

after(() => {
  memberPassport.__setMemberPassportKeysForTest(null)
})

// --- 方法/门控/参数 -------------------------------------------------------------------

test('非 GET → 405 + Allow: GET', async () => {
  enableMembership()
  const res = createResponse()
  await contentHandler(createRequest({ method: 'POST' }), res)
  assert.equal(res.statusCode, 405)
  assert.deepEqual(res.body, { success: false, error: 'method_not_allowed' })
  assert.equal(res.headers.allow, 'GET')
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('门控关(plan=free) → 403 disabled', async () => {
  enableMembership({ plan: 'free' })
  const res = createResponse()
  await contentHandler(
    createRequest({ query: { slug: SLUG }, cookies: { sm_session: makePassport() } }),
    res
  )
  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, { success: false, error: 'disabled' })
})

test('门控关(未配置 membership) → 403 disabled', async () => {
  enableMembership()
  adminStub.__setSupabaseClient(
    createFakeSupabase({ quotaRow: { plan: 'pro' }, membershipRow: null })
  )
  const res = createResponse()
  await contentHandler(
    createRequest({ query: { slug: SLUG }, cookies: { sm_session: makePassport() } }),
    res
  )
  assert.equal(res.statusCode, 403)
})

test('slug 缺失/空/超长(>200) → 400 bad_request', async () => {
  enableMembership()
  const passport = makePassport()

  const missing = createResponse()
  await contentHandler(createRequest({ cookies: { sm_session: passport } }), missing)
  assert.equal(missing.statusCode, 400)

  const empty = createResponse()
  await contentHandler(
    createRequest({ query: { slug: '   ' }, cookies: { sm_session: passport } }),
    empty
  )
  assert.equal(empty.statusCode, 400)

  const tooLong = createResponse()
  await contentHandler(
    createRequest({ query: { slug: 'x'.repeat(201) }, cookies: { sm_session: passport } }),
    tooLong
  )
  assert.equal(tooLong.statusCode, 400)
  assert.deepEqual(tooLong.body, { success: false, error: 'bad_request' })
})

// --- 会话 -----------------------------------------------------------------------------

test('无 cookie → 401 unauthorized', async () => {
  enableMembership()
  getBlogDataStub.__setPostBySlug({ id: 'page-1', properties: {} })
  const res = createResponse()
  await contentHandler(createRequest({ query: { slug: SLUG } }), res)
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { success: false, error: 'unauthorized' })
  assert.equal(getBlogDataStub.__getCalls(), 0)
})

test('坏 cookie → 401 unauthorized', async () => {
  enableMembership()
  const res = createResponse()
  await contentHandler(
    createRequest({ query: { slug: SLUG }, cookies: { sm_session: 'garbage.token.here' } }),
    res
  )
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { success: false, error: 'unauthorized' })
})

test('mexp 已过期 → 401(到期不供内容)', async () => {
  enableMembership()
  const now = Math.floor(Date.now() / 1000)
  const res = createResponse()
  await contentHandler(
    createRequest({
      query: { slug: SLUG },
      cookies: { sm_session: makePassport({ mexp: now - 60 }) },
    }),
    res
  )
  assert.equal(res.statusCode, 401)
  assert.equal(getBlogDataStub.__getCalls(), 0)
})

test('claims.exp <= now(宽限期内) → 401 本地硬判(M4)', async () => {
  enableMembership()
  const now = Math.floor(Date.now() / 1000)
  // exp 过期 1h,仍在验签 7d 宽限内(verifyMemberPassport 放行),本 API 必须硬拒
  const res = createResponse()
  await contentHandler(
    createRequest({
      query: { slug: SLUG },
      cookies: { sm_session: makePassport({ exp: now - 3600 }) },
    }),
    res
  )
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { success: false, error: 'unauthorized' })
  assert.equal(getBlogDataStub.__getCalls(), 0)
})

test('aud 不符(坏证件) → 401', async () => {
  enableMembership()
  const res = createResponse()
  await contentHandler(
    createRequest({
      query: { slug: SLUG },
      cookies: { sm_session: makePassport({ aud: 'other.example.com' }) },
    }),
    res
  )
  assert.equal(res.statusCode, 401)
})

test('无 host → 401;无 siteId → 403(门控 fail-closed 先于会话判定)', async () => {
  enableMembership()
  const noHost = createResponse()
  await contentHandler(
    createRequest({ headers: {}, query: { slug: SLUG }, cookies: { sm_session: makePassport() } }),
    noHost
  )
  assert.equal(noHost.statusCode, 401)

  // siteId 缺失时 membershipGate 必读不出配置(getEffectiveMembershipConfig=null),
  // 按 §5 流程步骤 2(门控 403)先于步骤 4(会话 401)命中——fail-closed 口径
  blogSiteStub.__setBlogSiteId(null)
  membershipGate.__resetMembershipGateCacheForTest()
  const noSite = createResponse()
  await contentHandler(
    createRequest({ query: { slug: SLUG }, cookies: { sm_session: makePassport() } }),
    noSite
  )
  assert.equal(noSite.statusCode, 403)
  assert.deepEqual(noSite.body, { success: false, error: 'disabled' })
})

// --- 内容与缓存 -----------------------------------------------------------------------

test('post 不存在 → 404 not_found', async () => {
  enableMembership()
  getBlogDataStub.__setPostBySlug(null)
  const res = createResponse()
  await contentHandler(
    createRequest({ query: { slug: SLUG }, cookies: { sm_session: makePassport() } }),
    res
  )
  assert.equal(res.statusCode, 404)
  assert.deepEqual(res.body, { success: false, error: 'not_found' })
})

test('无标记文章 → 200 {blocks:[]}(不报错)', async () => {
  enableMembership()
  getBlogDataStub.__setPostBySlug({ id: 'page-1', properties: {} })
  getBlocksStub.__setBlocks([para('p1', 'ONLY_PUBLIC')])
  const res = createResponse()
  await contentHandler(
    createRequest({ query: { slug: SLUG }, cookies: { sm_session: makePassport() } }),
    res
  )
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { success: true, blocks: [] })
})

test('happy → 200 仅 memberBlocks;公开区文本不在响应;带 ETag 与 no-store', async () => {
  enableMembership()
  getBlogDataStub.__setPostBySlug({ id: 'page-1', properties: {} })
  getBlocksStub.__setBlocks(HAPPY_BLOCKS)
  const res = createResponse()
  await contentHandler(
    createRequest({ query: { slug: SLUG }, cookies: { sm_session: makePassport() } }),
    res
  )
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.deepEqual(res.body.blocks, EXPECTED_MEMBER_BLOCKS)
  const raw = JSON.stringify(res.body)
  assert.equal(raw.includes('PUBLIC_INTRO'), false)
  assert.equal(raw.includes('MARKER_CHILD'), false)
  assert.equal(raw.includes('m1'), false)
  assert.equal(raw.includes('MEMBER_SECRET_A'), true)
  const expectedEtag = computeMemberContentEtag(EXPECTED_MEMBER_BLOCKS)
  assert.equal(res.headers.etag, `"${expectedEtag}"`)
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.equal(getBlocksStub.__getCalls(), 1)
})

test('If-None-Match 命中 → 304 空 body(仍带 ETag/no-store)', async () => {
  enableMembership()
  getBlogDataStub.__setPostBySlug({ id: 'page-1', properties: {} })
  getBlocksStub.__setBlocks(HAPPY_BLOCKS)
  const passport = makePassport()

  const first = createResponse()
  await contentHandler(
    createRequest({ query: { slug: SLUG }, cookies: { sm_session: passport } }),
    first
  )
  assert.equal(first.statusCode, 200)
  const etag = first.headers.etag

  const second = createResponse()
  await contentHandler(
    createRequest({
      query: { slug: SLUG },
      cookies: { sm_session: passport },
      ifNoneMatch: etag,
    }),
    second
  )
  assert.equal(second.statusCode, 304)
  assert.equal(second.body, undefined)
  assert.equal(second.headers.etag, etag)
  assert.equal(second.headers['cache-control'], 'no-store')
  assert.equal(getBlocksStub.__getCalls(), 1)
})

test('If-None-Match 宽松比对:多值列表含 etag 即命中;W/ 前缀不命中(M5)', async () => {
  enableMembership()
  getBlogDataStub.__setPostBySlug({ id: 'page-1', properties: {} })
  getBlocksStub.__setBlocks(HAPPY_BLOCKS)
  const passport = makePassport()

  const first = createResponse()
  await contentHandler(
    createRequest({ query: { slug: SLUG }, cookies: { sm_session: passport } }),
    first
  )
  const etag = first.headers.etag

  const multi = createResponse()
  await contentHandler(
    createRequest({
      query: { slug: SLUG },
      cookies: { sm_session: passport },
      ifNoneMatch: `"deadbeef", ${etag}`,
    }),
    multi
  )
  assert.equal(multi.statusCode, 304)

  // 缓存已在前两次调用建立(304 也算命中),重置后用 W/ 前缀验证不匹配
  clearMemberContentCache()
  getBlocksStub.__setBlocks(HAPPY_BLOCKS)
  const weak = createResponse()
  await contentHandler(
    createRequest({
      query: { slug: SLUG },
      cookies: { sm_session: passport },
      ifNoneMatch: `W/${etag}`,
    }),
    weak
  )
  assert.equal(weak.statusCode, 200)
  assert.deepEqual(weak.body.blocks, EXPECTED_MEMBER_BLOCKS)
})

test('缓存命中:二次调用 Notion stub 计数不增', async () => {
  enableMembership()
  getBlogDataStub.__setPostBySlug({ id: 'page-1', properties: {} })
  getBlocksStub.__setBlocks(HAPPY_BLOCKS)
  const passport = makePassport()

  const first = createResponse()
  await contentHandler(
    createRequest({ query: { slug: SLUG }, cookies: { sm_session: passport } }),
    first
  )
  assert.equal(first.statusCode, 200)
  assert.equal(getBlocksStub.__getCalls(), 1)

  const second = createResponse()
  await contentHandler(
    createRequest({ query: { slug: SLUG }, cookies: { sm_session: passport } }),
    second
  )
  assert.equal(second.statusCode, 200)
  assert.deepEqual(second.body.blocks, EXPECTED_MEMBER_BLOCKS)
  assert.equal(getBlocksStub.__getCalls(), 1)
  assert.equal(getBlogDataStub.__getCalls(), 1)
})

test('invalidateMemberContentCache(slug) 后重拉(计数 +1)', async () => {
  enableMembership()
  getBlogDataStub.__setPostBySlug({ id: 'page-1', properties: {} })
  getBlocksStub.__setBlocks(HAPPY_BLOCKS)
  const passport = makePassport()

  const first = createResponse()
  await contentHandler(
    createRequest({ query: { slug: SLUG }, cookies: { sm_session: passport } }),
    first
  )
  assert.equal(first.statusCode, 200)

  invalidateMemberContentCache(SLUG)

  const second = createResponse()
  await contentHandler(
    createRequest({ query: { slug: SLUG }, cookies: { sm_session: passport } }),
    second
  )
  assert.equal(second.statusCode, 200)
  assert.deepEqual(second.body.blocks, EXPECTED_MEMBER_BLOCKS)
  assert.equal(getBlocksStub.__getCalls(), 2)
})

test('etag 归一化:列表壳块 id 不影响 etag(M3)', () => {
  const mkList = (id) => ({
    id,
    type: 'bulleted_list',
    children: [para('li-1', 'X')],
  })
  const a = computeMemberContentEtag([mkList('uuid-a'), SECRET_A])
  const b = computeMemberContentEtag([mkList('uuid-b'), SECRET_A])
  assert.equal(a, b)
  // Notion 原生块 id 仍参与 etag
  const c = computeMemberContentEtag([para('p-diff-1', 'X')])
  const d = computeMemberContentEtag([para('p-diff-2', 'X')])
  assert.notEqual(c, d)
})
