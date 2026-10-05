const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { beforeEach, test } = require('node:test')
const babel = require('@babel/core')

const repoRoot = path.resolve(__dirname, '..')
const srcRoot = `${path.join(repoRoot, 'src')}${path.sep}`
const originalResolveFilename = Module._resolveFilename
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

const membershipGate = require('../src/lib/blog/membershipGate.ts')
const quotaStateLib = require('../src/lib/blog/quotaState.ts')

Module._resolveFilename = originalResolveFilename
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

const adminStub = require('./stubs/membership-admin-stub.cjs')
const blogSiteStub = require('./stubs/membership-blogsite-stub.cjs')

const SITE_ID = '11111111-2222-4333-8444-555555555555'

const {
  getMembershipConfig,
  getEffectiveMembershipConfig,
  __resetMembershipGateCacheForTest,
} = membershipGate

function createFakeSupabase({ membershipRow, membershipError, quotaRow } = {}) {
  const log = { membershipSelects: 0, quotaSelects: 0 }
  const wrap = (value) => {
    const p = Promise.resolve(value)
    p.eq = () => p
    p.maybeSingle = () => p
    return p
  }
  return {
    log,
    from(table) {
      if (table === 'blog_quota_state') {
        return {
          select() {
            log.quotaSelects += 1
            return wrap({ data: quotaRow ?? null, error: null })
          },
        }
      }
      return {
        select() {
          log.membershipSelects += 1
          return wrap({
            data: membershipRow !== undefined ? membershipRow : null,
            error: membershipError || null,
          })
        },
      }
    },
  }
}

beforeEach(() => {
  adminStub.__reset()
  blogSiteStub.__reset()
  __resetMembershipGateCacheForTest()
  quotaStateLib.invalidateSiteQuotaState()
})

// --- fail-closed 分支 -------------------------------------------------------------

test('无 BLOG_SITE_ID → null', async () => {
  adminStub.__setSupabaseClient(createFakeSupabase())
  blogSiteStub.__setBlogSiteId(null)
  assert.equal(await getMembershipConfig(), null)
})

test('无 Supabase client → null', async () => {
  blogSiteStub.__setBlogSiteId(SITE_ID)
  assert.equal(await getMembershipConfig(), null)
})

test('读取失败 → null(不缓存)', async () => {
  const supabase = createFakeSupabase({
    membershipError: { message: 'connection terminated' },
  })
  adminStub.__setSupabaseClient(supabase)
  blogSiteStub.__setBlogSiteId(SITE_ID)

  assert.equal(await getMembershipConfig(), null)
  assert.equal(await getMembershipConfig(), null)
  assert.equal(supabase.log.membershipSelects, 2)
})

test('缺列(迁移 022 未执行,Postgres 42703)→ null', async () => {
  adminStub.__setSupabaseClient(
    createFakeSupabase({
      membershipError: {
        message:
          'column "membership" of relation "blog_site_settings" does not exist',
      },
    })
  )
  blogSiteStub.__setBlogSiteId(SITE_ID)
  assert.equal(await getMembershipConfig(), null)
})

test('无行 → null(不缓存)', async () => {
  const supabase = createFakeSupabase({ membershipRow: null })
  adminStub.__setSupabaseClient(supabase)
  blogSiteStub.__setBlogSiteId(SITE_ID)

  assert.equal(await getMembershipConfig(), null)
  assert.equal(supabase.log.membershipSelects, 1)
})

test('enabled:false / membership:null / 值非对象 → null', async () => {
  blogSiteStub.__setBlogSiteId(SITE_ID)

  adminStub.__setSupabaseClient(
    createFakeSupabase({ membershipRow: { membership: { enabled: false } } })
  )
  assert.equal(await getMembershipConfig(), null)

  adminStub.__setSupabaseClient(
    createFakeSupabase({ membershipRow: { membership: null } })
  )
  __resetMembershipGateCacheForTest()
  assert.equal(await getMembershipConfig(), null)

  adminStub.__setSupabaseClient(
    createFakeSupabase({ membershipRow: { membership: 'on' } })
  )
  __resetMembershipGateCacheForTest()
  assert.equal(await getMembershipConfig(), null)
})

// --- 合法配置规范化 ---------------------------------------------------------------

test('合法配置:plans/copy 规范化(R2-B5a 结构化逐字段:trim、空值剔除)', async () => {
  adminStub.__setSupabaseClient(
    createFakeSupabase({
      quotaRow: { plan: 'pro' },
      membershipRow: {
        membership: {
          enabled: true,
          plans: [{ days: 30, price: 29, sku: 'MEM-30' }],
          copy: {
            intro: ' 会员说明 ',
            benefits: [' 权益一 ', '', '权益二'],
            guarantee: ' 保障说明 ',
            faq: [{ q: ' 问题一 ', a: ' 答案一 ' }, { q: '好问题', a: '' }],
            updatedAt: ' 2026-10-05 ',
          },
        },
      },
    })
  )
  blogSiteStub.__setBlogSiteId(SITE_ID)

  const config = await getMembershipConfig()
  assert.deepEqual(config, {
    enabled: true,
    plans: [{ days: 30, price: 29, sku: 'MEM-30' }],
    copy: {
      intro: '会员说明',
      benefits: ['权益一', '权益二'],
      guarantee: '保障说明',
      faq: [{ q: '问题一', a: '答案一' }],
      updatedAt: '2026-10-05',
    },
  })
})

// --- R6-6:copy.faq 归一 --------------------------------------------------------------

test('copy.faq 归一:非数组 → 字段缺失;全非法 → 字段缺失;非对象项丢弃', async () => {
  blogSiteStub.__setBlogSiteId(SITE_ID)

  adminStub.__setSupabaseClient(
    createFakeSupabase({
      membershipRow: {
        membership: { enabled: true, plans: [], copy: { faq: 'n/a', guarantee: ' 保障 ' } },
      },
    })
  )
  const nonArray = await getMembershipConfig()
  assert.deepEqual(nonArray.copy, { guarantee: '保障' })

  adminStub.__setSupabaseClient(
    createFakeSupabase({
      membershipRow: {
        membership: {
          enabled: true,
          plans: [],
          copy: { faq: [{ q: '', a: '答案' }, { q: '问题', a: '  ' }, 'x', 42, null] },
        },
      },
    })
  )
  __resetMembershipGateCacheForTest()
  const allInvalid = await getMembershipConfig()
  // faq 全非法且无其他合法字段 → 整份 copy 归 null(与 benefits 同口径)
  assert.equal(allInvalid.copy, null)

  adminStub.__setSupabaseClient(
    createFakeSupabase({
      membershipRow: {
        membership: {
          enabled: true,
          plans: [],
          copy: { faq: [{ q: ' 问题 ', a: ' 答案 ' }, 'bad', { q: 3, a: '答案' }] },
        },
      },
    })
  )
  __resetMembershipGateCacheForTest()
  const mixed = await getMembershipConfig()
  assert.deepEqual(mixed.copy, { faq: [{ q: '问题', a: '答案' }] })
})

test('copy.faq 上限宽松截断(读侧双保险):≤8 组、q≤80、a≤300', async () => {
  blogSiteStub.__setBlogSiteId(SITE_ID)

  adminStub.__setSupabaseClient(
    createFakeSupabase({
      membershipRow: {
        membership: {
          enabled: true,
          plans: [],
          copy: {
            faq: Array.from({ length: 12 }, (_, i) => ({
              q: `q${i}`.padEnd(200, 'Q'),
              a: `a${i}`.padEnd(500, 'A'),
            })),
          },
        },
      },
    })
  )
  const capped = await getMembershipConfig()
  assert.equal(capped.copy.faq.length, 8)
  assert.equal(capped.copy.faq[7].q.length, 80)
  assert.equal(capped.copy.faq[7].a.length, 300)
  assert.ok(capped.copy.faq[7].q.startsWith('q7'))
  assert.ok(capped.copy.faq[7].a.startsWith('a7'))
})

test('plans 混非法项剔除;全非法 → plans:[];非数组 → plans:[]', async () => {
  blogSiteStub.__setBlogSiteId(SITE_ID)

  adminStub.__setSupabaseClient(
    createFakeSupabase({
      membershipRow: {
        membership: {
          enabled: true,
          plans: [
            { days: 30, price: 29, sku: 'A' },
            { days: 0, price: 29, sku: 'B' },
            { days: 7.5, price: 9, sku: 'C' },
            { days: 7, price: 'nine', sku: 'D' },
            { days: 7, price: 9, sku: '' },
            { days: 7, price: 9, sku: '  ' },
            { days: 30, price: 0, sku: 'E' },
          ],
        },
      },
    })
  )
  const mixed = await getMembershipConfig()
  assert.deepEqual(mixed.plans, [
    { days: 30, price: 29, sku: 'A' },
    { days: 30, price: 0, sku: 'E' },
  ])

  adminStub.__setSupabaseClient(
    createFakeSupabase({
      membershipRow: {
        membership: { enabled: true, plans: [{ days: -1, price: 1, sku: 'X' }] },
      },
    })
  )
  __resetMembershipGateCacheForTest()
  const allBad = await getMembershipConfig()
  assert.deepEqual(allBad.plans, [])
  assert.equal(allBad.enabled, true)

  adminStub.__setSupabaseClient(
    createFakeSupabase({
      membershipRow: { membership: { enabled: true, plans: 'n/a' } },
    })
  )
  __resetMembershipGateCacheForTest()
  const nonArray = await getMembershipConfig()
  assert.deepEqual(nonArray.plans, [])
})

test('copy 归一(R3 重写):非对象 → null;字段级非法丢弃;全字段无效 → null;上限截断', async () => {
  blogSiteStub.__setBlogSiteId(SITE_ID)

  adminStub.__setSupabaseClient(
    createFakeSupabase({
      membershipRow: {
        membership: { enabled: true, plans: [], copy: { intro: 3, benefits: 'n/a', guarantee: ' 保障 ' } },
      },
    })
  )
  const fieldDropped = await getMembershipConfig()
  // 字段坏类型丢弃(intro/benefits 非法 → undefined),合法字段保留
  assert.deepEqual(fieldDropped.copy, { guarantee: '保障' })

  adminStub.__setSupabaseClient(
    createFakeSupabase({
      membershipRow: {
        membership: { enabled: true, plans: [], copy: { title: 3 } },
      },
    })
  )
  __resetMembershipGateCacheForTest()
  // 未知键不透传且全字段无效 → 整份 null
  const unknownKeys = await getMembershipConfig()
  assert.equal(unknownKeys.copy, null)

  adminStub.__setSupabaseClient(
    createFakeSupabase({
      membershipRow: { membership: { enabled: true, plans: [], copy: '文案' } },
    })
  )
  __resetMembershipGateCacheForTest()
  const badShape = await getMembershipConfig()
  assert.equal(badShape.copy, null)

  // 上限宽松截断(读侧双保险):benefits ≤8 条×≤120、intro ≤500、guarantee ≤300
  adminStub.__setSupabaseClient(
    createFakeSupabase({
      membershipRow: {
        membership: {
          enabled: true,
          plans: [],
          copy: {
            intro: 'x'.repeat(600),
            benefits: Array.from({ length: 12 }, (_, i) => `b${i}`).concat(['y'.repeat(200)]),
            guarantee: 'z'.repeat(400),
          },
        },
      },
    })
  )
  __resetMembershipGateCacheForTest()
  const capped = await getMembershipConfig()
  assert.equal(capped.copy.intro.length, 500)
  assert.equal(capped.copy.benefits.length, 8)
  assert.equal(capped.copy.benefits[7].length, 2)
  assert.equal(capped.copy.guarantee.length, 300)
})

// --- 缓存 -----------------------------------------------------------------------

test('15s TTL 缓存:命中后桩计数不再增长;reset 后重读', async () => {
  const supabase = createFakeSupabase({
    membershipRow: {
      membership: { enabled: true, plans: [{ days: 30, price: 29, sku: 'A' }] },
    },
  })
  adminStub.__setSupabaseClient(supabase)
  blogSiteStub.__setBlogSiteId(SITE_ID)

  await getMembershipConfig()
  await getMembershipConfig()
  await getMembershipConfig()
  assert.equal(supabase.log.membershipSelects, 1)

  __resetMembershipGateCacheForTest()
  await getMembershipConfig()
  assert.equal(supabase.log.membershipSelects, 2)
})

// --- 双门:getEffectiveMembershipConfig ------------------------------------------

test('getEffectiveMembershipConfig:plan 非 pro → null', async () => {
  adminStub.__setSupabaseClient(
    createFakeSupabase({
      quotaRow: { plan: 'free' },
      membershipRow: {
        membership: { enabled: true, plans: [{ days: 30, price: 29, sku: 'A' }] },
      },
    })
  )
  blogSiteStub.__setBlogSiteId(SITE_ID)

  const config = await getMembershipConfig()
  assert.notEqual(config, null)
  assert.equal(await getEffectiveMembershipConfig(), null)
})

test('getEffectiveMembershipConfig:plan=pro 且配置可用 → 返回配置', async () => {
  adminStub.__setSupabaseClient(
    createFakeSupabase({
      quotaRow: { plan: 'pro' },
      membershipRow: {
        membership: { enabled: true, plans: [{ days: 30, price: 29, sku: 'A' }] },
      },
    })
  )
  blogSiteStub.__setBlogSiteId(SITE_ID)

  const effective = await getEffectiveMembershipConfig()
  assert.notEqual(effective, null)
  assert.equal(effective.enabled, true)
  assert.equal(effective.plans.length, 1)
})

test('getEffectiveMembershipConfig:pro 但配置不可用 → null', async () => {
  adminStub.__setSupabaseClient(
    createFakeSupabase({ quotaRow: { plan: 'pro' }, membershipRow: null })
  )
  blogSiteStub.__setBlogSiteId(SITE_ID)

  assert.equal(await getEffectiveMembershipConfig(), null)
})
