/** 站点会员 B3:GET /api/admin/membership-state 端点测试(§9.3)。
 * 路线=复用既有桩(§16-Q6):真实 membershipGate/quotaState +
 * 既有 tests/stubs/membership-admin-stub.cjs / membership-blogsite-stub.cjs +
 * 新增 verifyAdminRequest 桩(与 roundtrip 测试共享)。 */
const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { afterEach, beforeEach, test } = require('node:test')
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
  if (request === '@/src/lib/admin/verifyAdminRequest') {
    return path.join(__dirname, 'stubs', 'member-editor-verifyadmin-stub.cjs')
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

const stateHandler = require('../src/pages/api/admin/membership-state.ts').default
const membershipGate = require('../src/lib/blog/membershipGate.ts')
const quotaStateLib = require('../src/lib/blog/quotaState.ts')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

const adminStub = require('./stubs/membership-admin-stub.cjs')
const blogSiteStub = require('./stubs/membership-blogsite-stub.cjs')
const verifyStub = require('./stubs/member-editor-verifyadmin-stub.cjs')

const SITE_ID = '11111111-2222-4333-8444-555555555555'

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

function enableMembership({ plan = 'pro', enabled = true, membershipRow } = {}) {
  adminStub.__setSupabaseClient(
    createFakeSupabase({
      quotaRow: { plan },
      membershipRow:
        membershipRow !== undefined
          ? membershipRow
          : {
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

function createRequest({ method = 'GET' } = {}) {
  return {
    method,
    headers: { host: 'blog.example.com' },
    cookies: {},
    query: {},
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
    end() {
      return this
    },
  }
}

beforeEach(() => {
  adminStub.__reset()
  blogSiteStub.__reset()
  verifyStub.__reset()
  membershipGate.__resetMembershipGateCacheForTest()
  quotaStateLib.invalidateSiteQuotaState()
})

afterEach(() => {
  // 若有用例覆写了 blogSite 桩函数(500 注入),恢复原实现
  if (typeof blogSiteStub.__originalGetBlogSiteIdOrNull === 'function') {
    blogSiteStub.getBlogSiteIdOrNull = blogSiteStub.__originalGetBlogSiteIdOrNull
    delete blogSiteStub.__originalGetBlogSiteIdOrNull
  }
})

test('鉴权失败 → 401 {success:false,error:未授权}', async () => {
  verifyStub.__setAllowed(false)
  const res = createResponse()
  await stateHandler(createRequest(), res)
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { success: false, error: '未授权' })
})

test('非 GET → 405 + Allow: GET', async () => {
  enableMembership()
  const res = createResponse()
  await stateHandler(createRequest({ method: 'POST' }), res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'GET')
})

test('成功(pro+enabled) → {success:true, plan:pro, enabled:true}', async () => {
  enableMembership({ plan: 'pro', enabled: true })
  const res = createResponse()
  await stateHandler(createRequest(), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { success: true, plan: 'pro', enabled: true })
})

test('free → plan:free(enabled 为原始读不受 plan 双门影响)', async () => {
  enableMembership({ plan: 'free', enabled: true })
  const res = createResponse()
  await stateHandler(createRequest(), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.plan, 'free')
  assert.equal(res.body.enabled, true)
})

test('membership 读 null(未配置行) → enabled:false', async () => {
  enableMembership({ plan: 'pro', membershipRow: null })
  const res = createResponse()
  await stateHandler(createRequest(), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { success: true, plan: 'pro', enabled: false })
})

test('依赖抛错 → 500 {success:false}', async () => {
  enableMembership()
  // quotaState.getSiteQuotaState 与 membershipGate.fetchMembershipRaw 都在 try 之外
  // 调 getBlogSiteIdOrNull()——覆写为抛错使 Promise.all 拒绝,走 handler catch
  blogSiteStub.__originalGetBlogSiteIdOrNull = blogSiteStub.getBlogSiteIdOrNull
  blogSiteStub.getBlogSiteIdOrNull = () => {
    throw new Error('boom')
  }
  membershipGate.__resetMembershipGateCacheForTest()
  quotaStateLib.invalidateSiteQuotaState()
  const res = createResponse()
  await stateHandler(createRequest(), res)
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.success, false)
  assert.equal(res.body.error, 'boom')
})
