/** VENDING_MODE:贩售机组件三态圆点模式测试（§2.6）。
 * 范式=tests/membership-state-api.test.cjs（node:test + babel + stubs）；
 * 桩经 require.cache 预置（本文件内联，不新增 stub 文件）：
 * - @/src/lib/supabase/admin       → 内存假 Supabase（blog_quota_state + blog_site_settings）
 * - @/src/lib/gallery/blogSite     → 固定 site_id
 * - @/src/lib/admin/verifyAdminRequest → 可切换放行（401 门）
 * - @/src/lib/notion/notion / getDatabase → 内存假 Notion widget 页
 * 真实模块：vendingSettings / vendingDefaults / quotaState / maintenancePassword / vending API。
 * 覆盖：GET 扩展字段默认；商户三态三分支；平台同步 official/custom 写/跳过；401/403 门；
 * 403 保护字段块已移除（登录商户改 url 无密码→非 403）；Q5 mode 非法 400；Q6 verifyAddress。 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { beforeEach, test } = require('node:test')
const babel = require('@babel/core')

process.env.ADMIN_MAINTENANCE_PASSWORD = 'test-maint-pass'
const MAINT_PASS = 'test-maint-pass'

const repoRoot = path.resolve(__dirname, '..')
const srcRoot = `${path.join(repoRoot, 'src')}${path.sep}`
const originalResolveFilename = Module._resolveFilename
const originalJsLoader = require.extensions['.js']
const originalTsLoader = require.extensions['.ts']

const SITE_ID = '11111111-2222-4333-8444-555555555555'

function resolveExistingFile(base) {
  for (const ext of ['.js', '.ts', '.tsx']) {
    const p = base + ext
    if (fs.existsSync(p)) return p
  }
  throw new Error('stub target not found: ' + base)
}

function seedModule(filename, exportsObj) {
  const m = new Module(filename, null)
  m.filename = filename
  m.loaded = true
  m.exports = exportsObj
  Module._cache[filename] = m
}

// ---------- 内存 fixture（每测试 beforeEach 重置） ----------
const fixture = {
  pages: [],
  settingsRow: null,
  quotaRow: null,
  ops: [],
}

function resetFixture() {
  fixture.pages = [makeWidgetPage()]
  fixture.settingsRow = null
  fixture.quotaRow = null
  fixture.ops = []
}

let createdSeq = 0
function makeWidgetPage({
  id = 'widget-1',
  status = 'Published',
  title = '贩售机',
  url = 'https://widget.example.com',
} = {}) {
  return {
    id,
    properties: {
      title: { type: 'title', title: [{ plain_text: title }] },
      slug: { type: 'rich_text', rich_text: [{ plain_text: 'vending' }] },
      excerpt: { type: 'rich_text', rich_text: [{ plain_text: url }] },
      type: { type: 'select', select: { name: 'Widget' } },
      status: { type: 'status', status: { name: status } },
    },
  }
}

function applyProperties(page, properties) {
  for (const [key, value] of Object.entries(properties)) {
    if (value?.title) {
      const text = value.title.map((t) => t.text?.content ?? t.plain_text ?? '').join('')
      page.properties.title = { type: 'title', title: [{ plain_text: text }] }
    } else if (key === 'slug' && value?.rich_text) {
      const text = value.rich_text.map((t) => t.text?.content ?? '').join('')
      page.properties.slug = { type: 'rich_text', rich_text: [{ plain_text: text }] }
    } else if (key === 'excerpt' && value?.rich_text) {
      const text = value.rich_text.map((t) => t.text?.content ?? '').join('')
      page.properties.excerpt = { type: 'rich_text', rich_text: [{ plain_text: text }] }
    } else if (key === 'type' && value?.select) {
      page.properties.type = { type: 'select', select: { name: value.select.name } }
    } else if (key === 'status') {
      const name = value.status?.name ?? value.select?.name ?? ''
      page.properties.status = { type: 'status', status: { name } }
    }
  }
}

// ---------- 桩模块 ----------
const notionStub = {
  databaseId: 'test-database-id',
  notion: {
    pages: {
      update: async ({ page_id, properties }) => {
        const page = fixture.pages.find((p) => p.id === page_id)
        if (!page) throw new Error('update target missing: ' + page_id)
        fixture.ops.push({ kind: 'widget', pageId: page_id, properties })
        applyProperties(page, properties)
        return {}
      },
      create: async ({ properties }) => {
        createdSeq += 1
        const page = { id: `widget-created-${createdSeq}`, properties: {} }
        fixture.ops.push({ kind: 'widget-create', properties })
        applyProperties(page, properties)
        fixture.pages.push(page)
        return { id: page.id }
      },
    },
  },
}

const getDatabaseStub = {
  getDatabaseMetadata: async () => ({
    properties: { title: { type: 'title' }, status: { type: 'status' } },
  }),
  getWidgetPages: async () => fixture.pages,
}

let verifyAllowed = true
const verifyAdminStub = {
  __setAllowed(value) {
    verifyAllowed = value
  },
  __reset() {
    verifyAllowed = true
  },
  verifyAdminRequest() {
    return verifyAllowed
  },
}

const blogSiteStub = {
  getBlogSiteIdOrNull() {
    return SITE_ID
  },
}

function chain(value) {
  const p = Promise.resolve(value)
  p.eq = () => p
  p.maybeSingle = () => p
  return p
}

function projectRow(cols, row) {
  if (!row) return null
  const out = {}
  for (const c of cols.split(',').map((s) => s.trim())) out[c] = row[c] ?? null
  return out
}

const fakeSupabase = {
  from(table) {
    if (table === 'blog_quota_state') {
      return { select: () => chain({ data: fixture.quotaRow ?? null, error: null }) }
    }
    if (table === 'blog_site_settings') {
      return {
        select: (cols) =>
          chain({ data: projectRow(cols, fixture.settingsRow), error: null }),
        update: (patch) => {
          if (!fixture.settingsRow) {
            const p = Promise.resolve({ data: null, error: { message: 'no row' } })
            p.eq = () => p
            return p
          }
          fixture.ops.push({ kind: 'settings-update', patch: { ...patch } })
          Object.assign(fixture.settingsRow, patch)
          const p = Promise.resolve({ data: null, error: null })
          p.eq = () => p
          return p
        },
        upsert: (row) => {
          fixture.ops.push({ kind: 'settings-upsert', patch: { ...row } })
          fixture.settingsRow = { ...(fixture.settingsRow || {}), ...row }
          return Promise.resolve({ data: null, error: null })
        },
      }
    }
    return { select: () => chain({ data: null, error: null }) }
  },
}

let currentSupabase = fakeSupabase
const supabaseAdminStub = {
  getSupabaseAdmin() {
    return currentSupabase
  },
}

// 预置桩缓存（先于任何 require 生效）
seedModule(resolveExistingFile(path.join(repoRoot, 'src/lib/supabase/admin')), supabaseAdminStub)
seedModule(resolveExistingFile(path.join(repoRoot, 'src/lib/gallery/blogSite')), blogSiteStub)
seedModule(resolveExistingFile(path.join(repoRoot, 'src/lib/admin/verifyAdminRequest')), verifyAdminStub)
seedModule(resolveExistingFile(path.join(repoRoot, 'src/lib/notion/notion')), notionStub)
seedModule(resolveExistingFile(path.join(repoRoot, 'src/lib/notion/getDatabase')), getDatabaseStub)

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
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

const vendingHandler = require('../src/pages/api/admin/vending.ts').default
const quotaStateLib = require('../src/lib/blog/quotaState.ts')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

// ---------- 请求/响应工厂 ----------
function createRequest({ method = 'GET', body, headers = {}, query = {} } = {}) {
  return { method, headers, cookies: {}, query, body }
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

function maintHeaders() {
  return { 'x-admin-maintenance-password': MAINT_PASS }
}

function widget() {
  return fixture.pages.find((p) => p.properties.slug?.rich_text?.[0]?.plain_text === 'vending')
}

beforeEach(() => {
  resetFixture()
  verifyAdminStub.__reset()
  currentSupabase = fakeSupabase
  quotaStateLib.invalidateSiteQuotaState()
})

// ---------- GET ----------
test('GET 扩展字段默认：无 settings 行 → mode=official、official*/custom* 全 null（Q10）', async () => {
  const res = createResponse()
  await vendingHandler(createRequest(), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.enabled, true)
  assert.equal(res.body.title, '贩售机')
  assert.equal(res.body.url, 'https://widget.example.com')
  assert.equal(res.body.mode, 'official')
  assert.equal(res.body.officialTitle, null)
  assert.equal(res.body.officialUrl, null)
  assert.equal(res.body.customTitle, null)
  assert.equal(res.body.customUrl, null)
  assert.equal(res.body.id, 'widget-1')
  assert.equal(res.body.source, 'notion')
})

test('GET 读 settings 新列：mode=custom + official/custom 快照透出', async () => {
  fixture.settingsRow = {
    vending_mode: 'custom',
    vending_official_title: '官方商店',
    vending_official_url: 'https://official.example.com',
    vending_custom_title: '我的店',
    vending_custom_url: 'https://my.example.com',
  }
  const res = createResponse()
  await vendingHandler(createRequest(), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.mode, 'custom')
  assert.equal(res.body.officialTitle, '官方商店')
  assert.equal(res.body.officialUrl, 'https://official.example.com')
  assert.equal(res.body.customTitle, '我的店')
  assert.equal(res.body.customUrl, 'https://my.example.com')
})

test('GET verifyAddress=1 分支保留：错密码 403、对密码 200（Q6）', async () => {
  const bad = createResponse()
  await vendingHandler(
    createRequest({ query: { verifyAddress: '1' }, headers: { 'x-admin-maintenance-password': 'wrong' } }),
    bad
  )
  assert.equal(bad.statusCode, 403)
  assert.equal(bad.body.success, false)

  const ok = createResponse()
  await vendingHandler(
    createRequest({ query: { verifyAddress: '1' }, headers: maintHeaders() }),
    ok
  )
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.body.success, true)
})

// ---------- 鉴权/套餐门 ----------
test('POST 未授权（无 Basic/Cookie、无维护密码）→ 401', async () => {
  verifyAdminStub.__setAllowed(false)
  const res = createResponse()
  await vendingHandler(createRequest({ method: 'POST', body: { enabled: true } }), res)
  assert.equal(res.statusCode, 401)
  assert.deepEqual(res.body, { success: false, error: '未授权' })
})

test('POST 免费版登录商户（无维护密码）→ 403 专业版权益', async () => {
  fixture.quotaRow = { plan: 'free' }
  const res = createResponse()
  await vendingHandler(createRequest({ method: 'POST', body: { enabled: true } }), res)
  assert.equal(res.statusCode, 403)
  assert.equal(res.body.error, '贩售机组件为专业版权益，升级后可用')
})

test('POST 免费版 + 维护密码（平台同步）→ 放行', async () => {
  fixture.quotaRow = { plan: 'free' }
  const res = createResponse()
  await vendingHandler(
    createRequest({
      method: 'POST',
      body: { enabled: true, title: '官方同步', url: 'https://official.example.com' },
      headers: maintHeaders(),
    }),
    res
  )
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
})

// ---------- 商户三态 ----------
test('商户 off：{enabled:false} 仅翻 widget status，title/url/mode 不动（Q1）', async () => {
  fixture.quotaRow = { plan: 'pro' }
  fixture.pages = [makeWidgetPage({ title: '旧标题', url: 'https://old.example.com' })]
  const res = createResponse()
  await vendingHandler(createRequest({ method: 'POST', body: { enabled: false } }), res)
  assert.equal(res.statusCode, 200)
  const w = widget()
  assert.equal(w.properties.status.status.name, 'Hidden')
  assert.equal(w.properties.title.title[0].plain_text, '旧标题')
  assert.equal(w.properties.excerpt.rich_text[0].plain_text, 'https://old.example.com')
  assert.equal(fixture.settingsRow.vending_enabled, false) // Q2 legacy 同步
  assert.equal(res.body.enabled, false)
  assert.equal(fixture.settingsRow.vending_mode ?? null, null) // mode 不动
})

test('商户 enabled-only：403 保护字段块已移除——带 title/url 无密码 → 非 403，title/url 不动', async () => {
  fixture.quotaRow = { plan: 'pro' }
  fixture.pages = [makeWidgetPage({ title: '旧标题', url: 'https://old.example.com', status: 'Hidden' })]
  const res = createResponse()
  await vendingHandler(
    createRequest({ method: 'POST', body: { enabled: true, title: '劫持', url: 'https://evil.example.com' } }),
    res
  )
  assert.notEqual(res.statusCode, 403)
  assert.equal(res.statusCode, 200)
  const w = widget()
  assert.equal(w.properties.status.status.name, 'Published') // 仅翻 status
  assert.equal(w.properties.title.title[0].plain_text, '旧标题') // title 不动
  assert.equal(w.properties.excerpt.rich_text[0].plain_text, 'https://old.example.com') // url 不动
})

test('商户 official：widget := official_*，mode=official，settings 先于 widget 写入（Q3）', async () => {
  fixture.quotaRow = { plan: 'pro' }
  fixture.settingsRow = {
    vending_official_title: '官方商店',
    vending_official_url: 'https://official.example.com',
  }
  fixture.pages = [makeWidgetPage({ title: '旧标题', url: 'https://old.example.com', status: 'Hidden' })]
  const res = createResponse()
  await vendingHandler(
    createRequest({ method: 'POST', body: { enabled: true, mode: 'official' } }),
    res
  )
  assert.equal(res.statusCode, 200)
  const w = widget()
  assert.equal(w.properties.status.status.name, 'Published')
  assert.equal(w.properties.title.title[0].plain_text, '官方商店')
  assert.equal(w.properties.excerpt.rich_text[0].plain_text, 'https://official.example.com')
  assert.equal(fixture.settingsRow.vending_mode, 'official')
  assert.equal(fixture.settingsRow.vending_enabled, true) // Q2
  // Q3 顺序：vending_mode 写入先于 widget 写入
  const modeWriteIdx = fixture.ops.findIndex(
    (op) => op.kind.startsWith('settings') && op.patch.vending_mode === 'official'
  )
  const widgetWriteIdx = fixture.ops.findIndex((op) => op.kind.startsWith('widget'))
  assert.ok(modeWriteIdx >= 0, 'settings vending_mode 写入已记录')
  assert.ok(widgetWriteIdx >= 0, 'widget 写入已记录')
  assert.ok(modeWriteIdx < widgetWriteIdx)
  // Q10 POST 返回完整 state
  assert.equal(res.body.mode, 'official')
  assert.equal(res.body.officialTitle, '官方商店')
  assert.equal(res.body.officialUrl, 'https://official.example.com')
})

test('商户 official：official_* 为空（过渡窗口）→ 回退 DEFAULT_*（Q4）', async () => {
  fixture.quotaRow = { plan: 'pro' }
  fixture.pages = [makeWidgetPage({ title: '旧标题', url: 'https://old.example.com', status: 'Hidden' })]
  const res = createResponse()
  await vendingHandler(
    createRequest({ method: 'POST', body: { enabled: true, mode: 'official' } }),
    res
  )
  assert.equal(res.statusCode, 200)
  const w = widget()
  assert.equal(w.properties.title.title[0].plain_text, '贩售机')
  assert.equal(w.properties.excerpt.rich_text[0].plain_text, 'https://store.pro-pl.us')
})

test('商户 custom：widget/custom_* := 提交值，空 title 回退「贩售机」', async () => {
  fixture.quotaRow = { plan: 'pro' }
  const res = createResponse()
  await vendingHandler(
    createRequest({
      method: 'POST',
      body: { enabled: true, mode: 'custom', title: '  ', url: 'https://my.example.com' },
    }),
    res
  )
  assert.equal(res.statusCode, 200)
  const w = widget()
  assert.equal(w.properties.status.status.name, 'Published')
  assert.equal(w.properties.title.title[0].plain_text, '贩售机')
  assert.equal(w.properties.excerpt.rich_text[0].plain_text, 'https://my.example.com')
  assert.equal(fixture.settingsRow.vending_mode, 'custom')
  assert.equal(fixture.settingsRow.vending_custom_title, '贩售机')
  assert.equal(fixture.settingsRow.vending_custom_url, 'https://my.example.com')
  assert.equal(fixture.settingsRow.vending_enabled, true) // Q2
  assert.equal(res.body.mode, 'custom')
  assert.equal(res.body.customTitle, '贩售机')
  assert.equal(res.body.customUrl, 'https://my.example.com')
})

test('商户 custom：title 超 40 字 → 400「按钮名称最多 40 字」（L5）', async () => {
  fixture.quotaRow = { plan: 'pro' }
  const res = createResponse()
  await vendingHandler(
    createRequest({
      method: 'POST',
      body: { enabled: true, mode: 'custom', title: 'x'.repeat(41), url: 'https://my.example.com' },
    }),
    res
  )
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.error, '按钮名称最多 40 字')
})

test('商户 custom：url 非 http → 400；title 恰 40 字放行', async () => {
  fixture.quotaRow = { plan: 'pro' }
  const bad = createResponse()
  await vendingHandler(
    createRequest({ method: 'POST', body: { enabled: true, mode: 'custom', title: '店', url: 'ftp://x' } }),
    bad
  )
  assert.equal(bad.statusCode, 400)
  assert.equal(bad.body.error, '贩售机地址必须以 http 开头')

  const ok = createResponse()
  await vendingHandler(
    createRequest({
      method: 'POST',
      body: { enabled: true, mode: 'custom', title: '好'.repeat(40), url: 'https://my.example.com' },
    }),
    ok
  )
  assert.equal(ok.statusCode, 200)
  assert.equal(fixture.settingsRow.vending_custom_title, '好'.repeat(40))
})

test('POST mode 非法值 → 400 拒绝（Q5，不静默归一）', async () => {
  fixture.quotaRow = { plan: 'pro' }
  const res = createResponse()
  await vendingHandler(
    createRequest({ method: 'POST', body: { enabled: true, mode: 'weird' } }),
    res
  )
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.success, false)
})

// ---------- 平台同步 ----------
test('平台同步 official 态站：official_* 更新 + widget 全量写（现状行为）', async () => {
  fixture.quotaRow = { plan: 'pro' }
  fixture.pages = [makeWidgetPage({ title: '旧标题', url: 'https://old.example.com', status: 'Hidden' })]
  const res = createResponse()
  await vendingHandler(
    createRequest({
      method: 'POST',
      body: { enabled: true, title: '官方同步', url: 'https://official.example.com' },
      headers: maintHeaders(),
    }),
    res
  )
  assert.equal(res.statusCode, 200)
  assert.equal(fixture.settingsRow.vending_official_title, '官方同步')
  assert.equal(fixture.settingsRow.vending_official_url, 'https://official.example.com')
  const w = widget()
  assert.equal(w.properties.status.status.name, 'Published')
  assert.equal(w.properties.title.title[0].plain_text, '官方同步')
  assert.equal(w.properties.excerpt.rich_text[0].plain_text, 'https://official.example.com')
  assert.equal(fixture.settingsRow.vending_enabled, true)
})

test('平台同步 official 态站：仅提供 title → url 保持现值；未提供字段不覆写 official_*', async () => {
  fixture.quotaRow = { plan: 'pro' }
  fixture.settingsRow = { vending_official_url: 'https://keep.example.com' }
  fixture.pages = [makeWidgetPage({ title: '旧标题', url: 'https://old.example.com' })]
  const res = createResponse()
  await vendingHandler(
    createRequest({ method: 'POST', body: { enabled: true, title: '只改名字' }, headers: maintHeaders() }),
    res
  )
  assert.equal(res.statusCode, 200)
  assert.equal(fixture.settingsRow.vending_official_title, '只改名字')
  assert.equal(fixture.settingsRow.vending_official_url, 'https://keep.example.com')
  const w = widget()
  assert.equal(w.properties.title.title[0].plain_text, '只改名字')
  assert.equal(w.properties.excerpt.rich_text[0].plain_text, 'https://old.example.com')
})

test('平台同步 custom 态站：只更新官方快照，跳过 widget 写入（enabled 也不动）', async () => {
  fixture.quotaRow = { plan: 'pro' }
  fixture.settingsRow = {
    vending_mode: 'custom',
    vending_custom_title: '我的店',
    vending_custom_url: 'https://my.example.com',
  }
  fixture.pages = [
    makeWidgetPage({ title: '我的店', url: 'https://my.example.com', status: 'Hidden' }),
  ]
  const res = createResponse()
  await vendingHandler(
    createRequest({
      method: 'POST',
      body: { enabled: true, title: '新官方', url: 'https://official2.example.com' },
      headers: maintHeaders(),
    }),
    res
  )
  assert.equal(res.statusCode, 200)
  // official_* 快照已更新
  assert.equal(fixture.settingsRow.vending_official_title, '新官方')
  assert.equal(fixture.settingsRow.vending_official_url, 'https://official2.example.com')
  // widget 完全未写：保持商户自定义且 status 不动
  const w = widget()
  assert.equal(w.properties.title.title[0].plain_text, '我的店')
  assert.equal(w.properties.excerpt.rich_text[0].plain_text, 'https://my.example.com')
  assert.equal(w.properties.status.status.name, 'Hidden')
  assert.equal(fixture.ops.filter((op) => op.kind.startsWith('widget')).length, 0)
  // 模式保持 custom
  assert.equal(res.body.mode, 'custom')
})

test('POST 响应返回完整 state（含 enabled/title/url/mode 官方自定义快照，Q10）', async () => {
  fixture.quotaRow = { plan: 'pro' }
  fixture.settingsRow = {
    vending_official_title: '官方商店',
    vending_official_url: 'https://official.example.com',
    vending_custom_title: '旧自定义',
    vending_custom_url: 'https://old-custom.example.com',
  }
  const res = createResponse()
  await vendingHandler(
    createRequest({
      method: 'POST',
      body: { enabled: true, mode: 'custom', title: '新店', url: 'https://new.example.com' },
    }),
    res
  )
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.enabled, true)
  assert.equal(res.body.title, '新店')
  assert.equal(res.body.url, 'https://new.example.com')
  assert.equal(res.body.mode, 'custom')
  assert.equal(res.body.officialTitle, '官方商店')
  assert.equal(res.body.officialUrl, 'https://official.example.com')
  assert.equal(res.body.customTitle, '新店')
  assert.equal(res.body.customUrl, 'https://new.example.com')
  assert.equal(res.body.source, 'notion')
})

// ---------- VENDING_MODE2：noteModal（购买说明弹窗开关） ----------
test('GET noteModal：无 settings 行 → false；行内 vending_note_modal=true → true（读取透出）', async () => {
  const none = createResponse()
  await vendingHandler(createRequest(), none)
  assert.equal(none.statusCode, 200)
  assert.equal(none.body.noteModal, false)

  fixture.settingsRow = { vending_note_modal: true }
  const on = createResponse()
  await vendingHandler(createRequest(), on)
  assert.equal(on.statusCode, 200)
  assert.equal(on.body.noteModal, true)
})

test('POST {noteModal:true}（登录商户）→ 200 + state.noteModal=true + widget 零写（enabled/mode/title 均不变）', async () => {
  fixture.quotaRow = { plan: 'pro' }
  fixture.pages = [makeWidgetPage({ title: '旧标题', url: 'https://old.example.com', status: 'Hidden' })]
  const res = createResponse()
  await vendingHandler(createRequest({ method: 'POST', body: { noteModal: true } }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.noteModal, true)
  assert.equal(fixture.settingsRow.vending_note_modal, true)
  // widget 零写：不触发任何 widget 写入（严禁落进 Q1 enabled-only 分支）
  assert.equal(fixture.ops.filter((op) => op.kind.startsWith('widget')).length, 0)
  const w = widget()
  assert.equal(w.properties.status.status.name, 'Hidden') // enabled 不动
  assert.equal(w.properties.title.title[0].plain_text, '旧标题') // title 不动
  assert.equal(w.properties.excerpt.rich_text[0].plain_text, 'https://old.example.com') // url 不动
  assert.equal(fixture.settingsRow.vending_mode ?? null, null) // mode 不动
  assert.equal(fixture.settingsRow.vending_enabled ?? null, null) // legacy 不动
})

test('POST {noteModal:"yes"} → 400「noteModal 参数非法」', async () => {
  fixture.quotaRow = { plan: 'pro' }
  const res = createResponse()
  await vendingHandler(createRequest({ method: 'POST', body: { noteModal: 'yes' } }), res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.success, false)
  assert.equal(res.body.error, 'noteModal 参数非法')
})

test('POST {mode:"custom",title,url,noteModal:true} → 模式与 noteModal 两处均落', async () => {
  fixture.quotaRow = { plan: 'pro' }
  const res = createResponse()
  await vendingHandler(
    createRequest({
      method: 'POST',
      body: { mode: 'custom', title: '购买资源包', url: 'https://my.example.com', noteModal: true },
    }),
    res
  )
  assert.equal(res.statusCode, 200)
  assert.equal(fixture.settingsRow.vending_mode, 'custom')
  assert.equal(fixture.settingsRow.vending_custom_title, '购买资源包')
  assert.equal(fixture.settingsRow.vending_custom_url, 'https://my.example.com')
  assert.equal(fixture.settingsRow.vending_note_modal, true)
  const w = widget()
  assert.equal(w.properties.title.title[0].plain_text, '购买资源包')
  assert.equal(w.properties.excerpt.rich_text[0].plain_text, 'https://my.example.com')
  assert.equal(res.body.noteModal, true)
  assert.equal(res.body.mode, 'custom')
})

test('平台同步（维护密码）POST 不含 noteModal → state.noteModal 保持原值不变', async () => {
  fixture.quotaRow = { plan: 'pro' }
  fixture.settingsRow = { vending_note_modal: true }
  const res = createResponse()
  await vendingHandler(
    createRequest({
      method: 'POST',
      body: { enabled: true, title: '官方同步', url: 'https://official.example.com' },
      headers: maintHeaders(),
    }),
    res
  )
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.noteModal, true)
  assert.equal(fixture.settingsRow.vending_note_modal, true)
})
