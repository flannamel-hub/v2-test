/** 站点会员 R2-B5b W6:post.js 主题守卫测试(会员模式下禁用 shop 系主题)。
 * 桩法参照 tests/member-editor-roundtrip.test.cjs(必桩五件)+
 * supabase/blogsite 桩(membership-state-api 同款)。
 * 覆盖:isShopThemeCode 纯函数别名族 / 会员开+shop 拒 403(不写 Notion/DB/不耗配额)/
 * mall 别名同样拒 / 会员关或 free 放行 / 非 shop 主题不受影响 / gallery 守卫零回归。 */
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
const isShopThemeCode = postModule.isShopThemeCode
const notionStub = require('./stubs/member-editor-notion-stub.cjs')
const adminStub = require('./stubs/membership-admin-stub.cjs')
const blogSiteStub = require('./stubs/membership-blogsite-stub.cjs')
const membershipGate = require('../src/lib/blog/membershipGate.ts')
const quotaStateLib = require('../src/lib/blog/quotaState.ts')
const galleryFeatureGateLib = require('../src/lib/blog/galleryFeatureGate.ts')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

// 共享 blogsite 桩缺 getBlogSiteId(themeSwitchQuota record 路径调用);
// 补一个同源函数(返回当前 siteId),不修改桩文件本身
if (!('getBlogSiteId' in blogSiteStub)) {
  blogSiteStub.getBlogSiteId = () => blogSiteStub.getBlogSiteIdOrNull() || ''
}

const SITE_ID = '11111111-2222-4333-8444-555555555555'
const PAGE_ID = 'theme-config-page-1'

function createFakeSupabase({ quotaRow, settingsRow } = {}) {
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

function setupSite({ plan = 'pro', membershipEnabled = true, galleryEnabled = true } = {}) {
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
  const fake = createFakeSupabase({ quotaRow: { plan }, settingsRow })
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

beforeEach(() => {
  adminStub.__reset()
  blogSiteStub.__reset()
  notionStub.__reset()
  membershipGate.__resetMembershipGateCacheForTest()
  quotaStateLib.invalidateSiteQuotaState()
  galleryFeatureGateLib.__resetGalleryFeatureGateCacheForTest()
})

// --- 纯函数 ----------------------------------------------------------------

test('isShopThemeCode:shop 别名族归一判定(大小写/空白容错)', () => {
  for (const code of ['shop', 'SHOP', ' shop ', 'mall', 'Mall', 'shop-v2', 'shopv2', 'SHOP-V2']) {
    assert.equal(isShopThemeCode(code), true, `expected true: ${JSON.stringify(code)}`)
  }
  for (const code of ['gallery', 'tweet', 'anzifan', 'v1', 'standard', 'tweet-dark', '', null, undefined, 'shopping']) {
    assert.equal(isShopThemeCode(code), false, `expected false: ${JSON.stringify(code)}`)
  }
})

// --- 路由分支:会员开 → shop 系拒 --------------------------------------------

test('会员开(pro+enabled)+excerpt=shop → 403,不写 Notion/DB/不耗配额', async () => {
  const { fake } = setupSite({ plan: 'pro', membershipEnabled: true })
  const res = await saveThemeConfig('shop')
  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, { success: false, error: '已启用站点会员，shop 主题不可用' })
  assert.equal(notionStub.__getUpdatedPages().length, 0)
  assert.equal(fake.log.updates.length, 0)
  assert.equal(fake.log.upserts.length, 0)
})

test('会员开+excerpt=mall(别名) → 403', async () => {
  setupSite({ plan: 'pro', membershipEnabled: true })
  const res = await saveThemeConfig('mall')
  assert.equal(res.statusCode, 403)
  assert.equal(res.body.error, '已启用站点会员，shop 主题不可用')
})

test('会员开+excerpt=shopv2(别名) → 403', async () => {
  setupSite({ plan: 'pro', membershipEnabled: true })
  const res = await saveThemeConfig('shopv2')
  assert.equal(res.statusCode, 403)
  assert.equal(res.body.error, '已启用站点会员，shop 主题不可用')
})

// --- 路由分支:放行场景 ------------------------------------------------------

test('会员未开(enabled=false)+excerpt=shop → 放行 200(Notion 已写)', async () => {
  setupSite({ plan: 'pro', membershipEnabled: false })
  const res = await saveThemeConfig('shop')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  const updated = notionStub.__getUpdatedPages()
  assert.equal(updated.length, 1)
  const excerptProp = updated[0].properties.excerpt.rich_text[0].text.content
  assert.equal(excerptProp, 'shop')
})

test('free+enabled(边缘组合)+excerpt=shop → 放行 200(双门口径=pro 且 enabled)', async () => {
  setupSite({ plan: 'free', membershipEnabled: true })
  const res = await saveThemeConfig('shop')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
})

test('会员开+excerpt=tweet(非 shop) → 不受影响 200', async () => {
  setupSite({ plan: 'pro', membershipEnabled: true })
  const res = await saveThemeConfig('tweet')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
})

test('会员开+excerpt=gallery(图库开启) → gallery 守卫放行 200(零回归)', async () => {
  setupSite({ plan: 'pro', membershipEnabled: true, galleryEnabled: true })
  const res = await saveThemeConfig('gallery')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
})

test('会员开+excerpt=gallery(图库关) → 既有 gallery 守卫 403(守卫顺序回归)', async () => {
  setupSite({ plan: 'pro', membershipEnabled: true, galleryEnabled: false })
  const res = await saveThemeConfig('gallery')
  assert.equal(res.statusCode, 403)
  assert.equal(res.body.error, '该主题当前不可用')
})
