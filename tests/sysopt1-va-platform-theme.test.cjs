/** SYS-OPT1 V-A:平台主题控制测试(迁移 025 读取 + 停用直放/不计数/清零态 + 服务端禁用守卫)。
 * 桩法参照 tests/member-r2-theme-guard.test.cjs(必桩五件)。
 * 覆盖:normalizeThemeId 八主题别名族 / sanitizeDisabledThemes 脏数据清洗 /
 * getPlatformThemeControls 行读取与 fail-safe 默认 / TTL 缓存 /
 * limitEnabled=false → quota 清零态 + assert 直放 + record 不写库 /
 * post.js:禁用主题 403(不写 Notion/DB/不耗配额) + 别名拒绝 + 重复保存放行 + 切出放行 +
 * 平台读取失败 fail-open 放行 / theme-cooldown 响应含 platform 字段。 */
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
  if (request === '@notionhq/client' || request === '@/src/lib/blog/contentRevalidation') {
    return path.join(__dirname, 'stubs', 'member-editor-notion-stub.cjs')
  }
  if (request === 'notion-to-md') {
    return path.join(__dirname, 'stubs', 'member-editor-n2m-stub.cjs')
  }
  if (request === '@/src/lib/media/imageHostConfig') {
    return path.join(__dirname, 'stubs', 'member-editor-imagehost-stub.cjs')
  }
  if (request === '@/src/lib/admin/verifyAdminRequest') {
    return path.join(__dirname, 'stubs', 'member-editor-verifyadmin-stub.cjs')
  }
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

const postModule = require('../src/pages/api/admin/post.js')
const postHandler = postModule.default
const notionStub = require('./stubs/member-editor-notion-stub.cjs')
const adminStub = require('./stubs/membership-admin-stub.cjs')
const blogSiteStub = require('./stubs/membership-blogsite-stub.cjs')
const membershipGate = require('../src/lib/blog/membershipGate.ts')
const quotaStateLib = require('../src/lib/blog/quotaState.ts')
const galleryFeatureGateLib = require('../src/lib/blog/galleryFeatureGate.ts')
const platformControlsLib = require('../src/lib/blog/platformThemeControls.ts')
const quotaLib = require('../src/lib/blog/themeSwitchQuota.ts')
const cooldownModule = require('../src/pages/api/admin/theme-cooldown.ts')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

// 共享 blogsite 桩缺 getBlogSiteId(themeSwitchQuota record 路径调用);补同源函数
if (!('getBlogSiteId' in blogSiteStub)) {
  blogSiteStub.getBlogSiteId = () => blogSiteStub.getBlogSiteIdOrNull() || ''
}

const SITE_ID = '11111111-2222-4333-8444-555555555555'
const PAGE_ID = 'theme-config-page-1'
const { normalizeThemeId, sanitizeDisabledThemes } = platformControlsLib

function createFakeSupabase({ quotaRow, settingsRow, platformRow } = {}) {
  const row = settingsRow
  const log = { updates: [], upserts: [], inserts: [], platformSelects: 0 }
  const selectChain = (resolver, onCall) => {
    if (onCall) onCall()
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
      if (table === 'blog_platform_settings') {
        return {
          select: () =>
            selectChain(
              () => ({ data: platformRow ?? null, error: null }),
              () => {
                log.platformSelects += 1
              }
            ),
        }
      }
      if (table === 'blog_site_settings') {
        return {
          select: () => selectChain(() => ({ data: row ?? null, error: null })),
          update: (values) =>
            writeChain(() => {
              log.updates.push({ table, values })
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

function setupSite({ plan = 'pro', membershipEnabled = true, galleryEnabled = true, platformRow = null } = {}) {
  const settingsRow = {
    theme_code: 'gallery',
    membership: {
      enabled: membershipEnabled,
      plans: [{ days: 30, price: 29, sku: 'MEM-30' }],
      copy: null,
    },
    gallery_feature_enabled: galleryEnabled,
    theme_switch_window_start: null,
    theme_switch_count: 0,
  }
  const fake = createFakeSupabase({ quotaRow: { plan }, settingsRow, platformRow })
  adminStub.__setSupabaseClient(fake)
  blogSiteStub.__setBlogSiteId(SITE_ID)
  notionStub.__reset()
  notionStub.__setPagesRetrieve(async () => ({
    id: PAGE_ID,
    properties: { title: { type: 'title' } },
    cover: null,
  }))
  return { fake, settingsRow }
}

function createRequest({ method = 'POST', body } = {}) {
  return {
    method,
    headers: { host: 'blog.example.com' },
    cookies: {},
    query: { id: PAGE_ID },
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

async function saveThemeConfig(excerpt) {
  const res = createResponse()
  await postHandler(
    createRequest({
      method: 'POST',
      body: { id: PAGE_ID, title: '主题配置', slug: 'theme-config', excerpt },
    }),
    res
  )
  return res
}

const PLATFORM_ROW = (over = {}) => ({
  theme_switch_limit_enabled: true,
  disabled_themes: [],
  ...over,
})

beforeEach(() => {
  adminStub.__reset()
  blogSiteStub.__reset()
  notionStub.__reset()
  membershipGate.__resetMembershipGateCacheForTest()
  quotaStateLib.invalidateSiteQuotaState()
  galleryFeatureGateLib.__resetGalleryFeatureGateCacheForTest()
  platformControlsLib.__resetPlatformThemeControlsCacheForTest()
})

// --- 纯函数 ----------------------------------------------------------------

test('normalizeThemeId:八主题别名族(含大小写/空白/未知回退)', () => {
  const cases = {
    touchgal: ['v2', 'touchgal', ' V2 '],
    gallery: ['gallery'],
    'tweet-light': ['tweet-light', 'tweet_light'],
    'tweet-dark': ['tweet-dark', 'tweet_dark'],
    tweet: ['tweet', 'morethan-log', 'morethanlog', 'v3'],
    anzifan: ['v1', 'anzifan', 'standard'],
    shop: ['shop', 'mall'],
    'shop-v2': ['shop-v2', 'shopv2'],
  }
  for (const [expected, aliases] of Object.entries(cases)) {
    for (const a of aliases) {
      assert.equal(normalizeThemeId(a), expected, `${JSON.stringify(a)} -> ${expected}`)
    }
  }
  assert.equal(normalizeThemeId(''), 'anzifan')
  assert.equal(normalizeThemeId(null), 'anzifan')
  assert.equal(normalizeThemeId(undefined), 'anzifan')
  assert.equal(normalizeThemeId('bogus'), 'anzifan')
})

test('sanitizeDisabledThemes:非数组/非串元素/未知项/重复项清洗', () => {
  assert.deepEqual(sanitizeDisabledThemes('gallery'), [])
  assert.deepEqual(sanitizeDisabledThemes(null), [])
  assert.deepEqual(sanitizeDisabledThemes([123, null, 'bogus', 'v1', 'v1', 'Mall']), ['anzifan', 'shop'])
  assert.deepEqual(sanitizeDisabledThemes(['tweet-light', 'tweet_light']), ['tweet-light'])
})

// --- 平台读取 ----------------------------------------------------------------

test('getPlatformThemeControls:正常行读取 + 清洗', async () => {
  setupSite({
    platformRow: PLATFORM_ROW({
      theme_switch_limit_enabled: false,
      disabled_themes: ['tweet-light', 'v1', 'bogus'],
    }),
  })
  const ctrl = await platformControlsLib.getPlatformThemeControls()
  assert.equal(ctrl.limitEnabled, false)
  assert.deepEqual(ctrl.disabledThemes, ['tweet-light', 'anzifan'])
})

test('getPlatformThemeControls:缺行 → fail-safe 默认(限开+空集)', async () => {
  setupSite({ platformRow: null })
  const ctrl = await platformControlsLib.getPlatformThemeControls()
  assert.deepEqual(ctrl, { limitEnabled: true, disabledThemes: [] })
})

test('getPlatformThemeControls:TTL 缓存生效(窗口内不重复查库)', async () => {
  const { fake } = setupSite({
    platformRow: PLATFORM_ROW({ disabled_themes: ['gallery'] }),
  })
  platformControlsLib.__resetPlatformThemeControlsCacheForTest(60_000)
  await platformControlsLib.getPlatformThemeControls()
  await platformControlsLib.getPlatformThemeControls()
  assert.equal(fake.log.platformSelects, 1)
  platformControlsLib.__resetPlatformThemeControlsCacheForTest(0)
  await platformControlsLib.getPlatformThemeControls()
  assert.equal(fake.log.platformSelects, 2)
})

// --- 配额库:停用语义(1A) -----------------------------------------------------

test('limitEnabled=false → 配额状态清零态', async () => {
  setupSite({ platformRow: PLATFORM_ROW({ theme_switch_limit_enabled: false }) })
  const st = await quotaLib.getThemeSwitchQuotaStatus()
  assert.equal(st.blocked, false)
  assert.equal(st.used, 0)
  assert.equal(st.remaining, st.maxSwitches)
  assert.equal(st.windowStart, null)
})

test('limitEnabled=false → assert 直放(窗口已满也放行)', async () => {
  setupSite({ platformRow: PLATFORM_ROW({ theme_switch_limit_enabled: false }) })
  await assert.doesNotReject(() => quotaLib.assertThemeSwitchAllowed('a', 'b'))
})

test('limitEnabled=false → record 不写库(不计数)', async () => {
  const { fake } = setupSite({ platformRow: PLATFORM_ROW({ theme_switch_limit_enabled: false }) })
  await quotaLib.recordThemeSwitchIfNeeded('a', 'b')
  assert.equal(fake.log.updates.length, 0)
  assert.equal(fake.log.upserts.length, 0)
})

// --- post.js 路由:禁用守卫(2A) -------------------------------------------------

test('禁用 tweet → 存 tweet → 403 该主题已暂停开放,不写 Notion/DB/不耗配额', async () => {
  const { fake } = setupSite({ platformRow: PLATFORM_ROW({ disabled_themes: ['tweet'] }) })
  const res = await saveThemeConfig('tweet')
  assert.equal(res.statusCode, 403, JSON.stringify(res.body))
  assert.deepEqual(res.body, { success: false, error: '该主题已暂停开放' })
  assert.equal(notionStub.__getUpdatedPages().length, 0)
  assert.equal(fake.log.updates.length, 0)
  assert.equal(fake.log.upserts.length, 0)
})

test('禁用 anzifan → 存 standard(别名) → 403', async () => {
  setupSite({ platformRow: PLATFORM_ROW({ disabled_themes: ['anzifan'] }) })
  const res = await saveThemeConfig('standard')
  assert.equal(res.statusCode, 403)
  assert.equal(res.body.error, '该主题已暂停开放')
})

test('当前主题=被禁主题,重复保存同主题 → 放行 200(prev===next)', async () => {
  const { fake } = setupSite({
    platformRow: PLATFORM_ROW({ disabled_themes: ['gallery'] }),
  })
  // setupSite 的 settingsRow.theme_code='gallery' → previousThemeCode='gallery'
  fake.log.updates.length = 0
  const res = await saveThemeConfig('gallery')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
})

test('当前主题=被禁主题,切出到其它主题 → 放行 200(允许切出)', async () => {
  setupSite({ platformRow: PLATFORM_ROW({ disabled_themes: ['gallery'] }) })
  const res = await saveThemeConfig('tweet')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
})

test('平台读取缺行 → fail-open 放行 200', async () => {
  setupSite({ platformRow: null })
  const res = await saveThemeConfig('tweet')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
})

// --- theme-cooldown 响应形状 -------------------------------------------------

test('theme-cooldown 响应含 platform 字段', async () => {
  setupSite({ platformRow: PLATFORM_ROW({ disabled_themes: ['shop'] }) })
  const res = createResponse()
  await cooldownModule.default(createRequest({ method: 'GET' }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.ok(res.body.quota)
  assert.deepEqual(res.body.platform, { limitEnabled: true, disabledThemes: ['shop'] })
})
