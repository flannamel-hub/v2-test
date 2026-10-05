/** 站点会员 R2-B5b W5:GET/POST /api/admin/pricing-copy 端点测试。
 * 桩法参照 tests/membership-state-api.test.cjs:真实 membershipGate/quotaState/revalidateQueue +
 * 既有 stubs(membership-admin / membership-blogsite / member-editor-verifyadmin)。
 * 覆盖:鉴权 / 405 / GET 门控态与 plans / POST 双门 403 / sanitize 截断与清洗 /
 * 全空恢复默认 / enabled-plans 不被覆写 / revalidate 入队 / 写失败 500。 */
const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { beforeEach, test } = require('node:test')
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

const pricingCopyHandler = require('../src/pages/api/admin/pricing-copy.ts').default
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

/** 通用假 Supabase:settings 行按引用捕获(update 就地改 membership),log 记录写操作 */
function createFakeSupabase({ quotaRow, settingsRow, updateError = null } = {}) {
  const row = settingsRow
  const log = { updates: [], upserts: [], inserts: [] }
  const selectChain = (resolver) => {
    const p = Promise.resolve(resolver())
    p.eq = () => p
    p.maybeSingle = () => p
    return p
  }
  const writeChain = (apply) => {
    const p = Promise.resolve(apply())
    p.eq = () => p
    return p
  }
  return {
    log,
    from(table) {
      if (table === 'blog_quota_state') {
        return { select: () => selectChain(() => ({ data: quotaRow ?? null, error: null })) }
      }
      if (table === 'blog_site_settings') {
        return {
          select: () => selectChain(() => ({ data: row ?? null, error: null })),
          update: (values) =>
            writeChain(() => {
              log.updates.push({ table, values })
              if (updateError) return { data: null, error: updateError }
              if (values && Object.prototype.hasOwnProperty.call(values, 'membership') && row) {
                row.membership = values.membership
              }
              return { data: null, error: null }
            }),
          upsert: (values) => {
            log.upserts.push({ table, values })
            return Promise.resolve({ data: null, error: null })
          },
        }
      }
      return {
        select: () => selectChain(() => ({ data: null, error: null })),
        insert: (values) => {
          log.inserts.push({ table, values })
          return Promise.resolve({ data: null, error: null })
        },
      }
    },
  }
}

function setupSite({ plan = 'pro', enabled = true, copy = null, plans } = {}) {
  const settingsRow = {
    membership: {
      enabled,
      plans:
        plans !== undefined
          ? plans
          : [{ days: 30, price: 29, sku: 'MEM-30' }, { days: 90, price: 79, sku: 'MEM-90' }],
      copy,
    },
  }
  const fake = createFakeSupabase({ quotaRow: { plan }, settingsRow })
  adminStub.__setSupabaseClient(fake)
  blogSiteStub.__setBlogSiteId(SITE_ID)
  return { fake, settingsRow }
}

function createRequest({ method = 'GET', body } = {}) {
  return {
    method,
    headers: { host: 'blog.example.com' },
    cookies: {},
    query: {},
    body: body ?? {},
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

// --- GET ------------------------------------------------------------------

test('GET 未授权 → 401', async () => {
  verifyStub.__setAllowed(false)
  const res = createResponse()
  await pricingCopyHandler(createRequest(), res)
  assert.equal(res.statusCode, 401)
  assert.equal(res.body.success, false)
})

test('PUT → 405 + Allow: GET, POST', async () => {
  setupSite()
  const res = createResponse()
  await pricingCopyHandler(createRequest({ method: 'PUT' }), res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'GET, POST')
})

test('GET(pro+enabled) → copy/plans/plan/enabled 齐全', async () => {
  setupSite({ copy: { intro: '站内介绍', benefits: ['要点A'], guarantee: '保障' } })
  const res = createResponse()
  await pricingCopyHandler(createRequest(), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.plan, 'pro')
  assert.equal(res.body.enabled, true)
  assert.deepEqual(res.body.copy, { intro: '站内介绍', benefits: ['要点A'], guarantee: '保障' })
  assert.equal(Array.isArray(res.body.plans), true)
  assert.equal(res.body.plans.length, 2)
  assert.equal(res.body.plans[0].days, 30)
  assert.equal(res.body.plans[0].price, 29)
})

test('GET(free) → plan:free(enabled 原始读不受双门影响)', async () => {
  setupSite({ plan: 'free' })
  const res = createResponse()
  await pricingCopyHandler(createRequest(), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.plan, 'free')
  assert.equal(res.body.enabled, true)
  assert.equal(res.body.copy, null)
})

// --- POST -----------------------------------------------------------------

test('POST 未授权 → 401', async () => {
  verifyStub.__setAllowed(false)
  const res = createResponse()
  await pricingCopyHandler(createRequest({ method: 'POST', body: {} }), res)
  assert.equal(res.statusCode, 401)
})

test('POST(free) → 双门 403,不写库', async () => {
  const { fake } = setupSite({ plan: 'free' })
  const res = createResponse()
  await pricingCopyHandler(
    createRequest({ method: 'POST', body: { intro: 'x' } }),
    res
  )
  assert.equal(res.statusCode, 403)
  assert.equal(res.body.success, false)
  assert.equal(fake.log.updates.length, 0)
})

test('POST(未开通 enabled=false) → 双门 403', async () => {
  const { fake } = setupSite({ enabled: false })
  const res = createResponse()
  await pricingCopyHandler(
    createRequest({ method: 'POST', body: { intro: 'x' } }),
    res
  )
  assert.equal(res.statusCode, 403)
  assert.equal(res.body.success, false)
  assert.equal(fake.log.updates.length, 0)
})

test('POST sanitize:超长截断/非字符串剔除/空行丢弃/条数封顶', async () => {
  const { settingsRow } = setupSite()
  const longIntro = '介'.repeat(600)
  const longItem = '要'.repeat(200)
  const benefits = [
    '  要点一  ',          // trim
    42,                    // 非字符串剔除
    '   ',                 // 空行剔除
    longItem,              // >120 截断
    ...Array.from({ length: 10 }, (_, i) => `条目${i}`), // 超出 8 条截断
  ]
  const longGuarantee = '保'.repeat(400)
  const res = createResponse()
  await pricingCopyHandler(
    createRequest({ method: 'POST', body: { intro: longIntro, benefits, guarantee: longGuarantee } }),
    res
  )
  assert.equal(res.statusCode, 200)
  const copy = res.body.copy
  assert.equal(copy.intro.length, 500)
  assert.equal(copy.guarantee.length, 300)
  assert.equal(copy.benefits.length, 8)
  assert.equal(copy.benefits[0], '要点一')
  assert.equal(copy.benefits[1].length, 120)
  assert.equal(typeof copy.updatedAt, 'string')
  // 写库对账:membership.copy 已替换,enabled/plans 保留原值
  assert.equal(settingsRow.membership.enabled, true)
  assert.equal(settingsRow.membership.plans.length, 2)
  assert.equal(settingsRow.membership.copy.intro.length, 500)
})

test('POST 全部留空 → copy:null(恢复默认),enabled/plans 不动', async () => {
  const { settingsRow } = setupSite({ copy: { intro: '旧文案' } })
  const res = createResponse()
  await pricingCopyHandler(
    createRequest({ method: 'POST', body: { intro: '', benefits: [], guarantee: '' } }),
    res
  )
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.copy, null)
  assert.equal(settingsRow.membership.copy, null)
  assert.equal(settingsRow.membership.enabled, true)
  assert.equal(settingsRow.membership.plans.length, 2)
})

test('POST body 携带 enabled/plans → 显式忽略,不写入', async () => {
  const { settingsRow } = setupSite()
  const res = createResponse()
  await pricingCopyHandler(
    createRequest({
      method: 'POST',
      body: { intro: '新文案', enabled: false, plans: [{ days: 1, price: 1, sku: 'HACK' }] },
    }),
    res
  )
  assert.equal(res.statusCode, 200)
  assert.equal(settingsRow.membership.enabled, true)
  assert.equal(settingsRow.membership.plans.length, 2)
  assert.notEqual(settingsRow.membership.plans[0].sku, 'HACK')
  assert.equal(settingsRow.membership.copy.intro, '新文案')
})

test('POST 成功后 revalidate 入队(/pricing)', async () => {
  const { fake } = setupSite()
  const res = createResponse()
  await pricingCopyHandler(
    createRequest({ method: 'POST', body: { intro: '文案' } }),
    res
  )
  assert.equal(res.statusCode, 200)
  const queueInserts = fake.log.inserts.filter((i) => i.table === 'blog_revalidate_queue')
  assert.equal(queueInserts.length, 1)
  assert.equal(queueInserts[0].values.path, '/pricing')
})

test('POST 写库失败 → 500', async () => {
  const settingsRow = {
    membership: { enabled: true, plans: [{ days: 30, price: 29, sku: 'MEM-30' }], copy: null },
  }
  const fake = createFakeSupabase({
    quotaRow: { plan: 'pro' },
    settingsRow,
    updateError: { message: 'boom' },
  })
  adminStub.__setSupabaseClient(fake)
  blogSiteStub.__setBlogSiteId(SITE_ID)
  const res = createResponse()
  await pricingCopyHandler(
    createRequest({ method: 'POST', body: { intro: 'x' } }),
    res
  )
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.success, false)
})
