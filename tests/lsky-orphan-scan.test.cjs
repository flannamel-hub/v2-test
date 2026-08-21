const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { Readable } = require('node:stream')
const { after, beforeEach, test } = require('node:test')
const babel = require('@babel/core')

const repoRoot = path.resolve(__dirname, '..')
const srcRoot = `${path.join(repoRoot, 'src')}${path.sep}`
const originalResolveFilename = Module._resolveFilename
const originalJsLoader = require.extensions['.js']
const originalTsLoader = require.extensions['.ts']
const originalFetch = global.fetch
const originalWindow = global.window
const envKeys = ['AUTH_USER', 'AUTH_PASS', 'LSKY_TOKEN', 'LSKY_URL']
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))

process.env.AUTH_USER = 'p6-test-admin'
process.env.AUTH_PASS = 'p6-test-password'
process.env.LSKY_TOKEN = 'p6-test-token'
process.env.LSKY_URL = 'https://images.example'

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

// 回收站存储依赖 window.localStorage，测试内提供内存版
const storageData = new Map()
global.window = {
  localStorage: {
    getItem: (key) => (storageData.has(key) ? storageData.get(key) : null),
    setItem: (key, value) => storageData.set(key, String(value)),
    removeItem: (key) => storageData.delete(key),
  },
}

const { isValidLskyFileKey } = require('../src/lib/admin/lskyServer.js')
const {
  buildPathKeys,
  buildReferenceKeySet,
  buildReferenceIndex,
  detectOrphanFiles,
  extractPlainTextUrls,
  collectRichTextUrls,
  collectBlockUrls,
  collectPageObjectUrls,
  fetchAllLskyImages,
  joinPublicAssetUrl,
} = require('../src/lib/admin/lskyOrphanScan.js')
const trashStore = require('../src/lib/admin/lskyTrashStore.js')
const deleteHandler = require('../src/pages/api/admin/lsky-delete.js').default
const scanHandler = require('../src/pages/api/admin/lsky-scan.js').default

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

let fetchCalls = []

function authValue() {
  return Buffer.from(`${process.env.AUTH_USER}:${process.env.AUTH_PASS}`).toString('base64')
}

function createJsonRequest({ authorization, body } = {}) {
  const req = Readable.from([JSON.stringify(body || {})])
  req.method = 'POST'
  req.headers = { 'content-type': 'application/json' }
  if (authorization) req.headers.authorization = authorization
  req.cookies = {}
  req.body = body || {}
  return req
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

beforeEach(() => {
  fetchCalls = []
  global.fetch = async (input, init) => {
    fetchCalls.push({ input, init })
    return new Response(JSON.stringify({ status: true, message: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
})

after(() => {
  global.fetch = originalFetch
  global.window = originalWindow
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

// ---------- key 校验 ----------

test('文件 key 白名单：合法字符集与长度', () => {
  assert.equal(isValidLskyFileKey('abcXYZ019-_'), true)
  assert.equal(isValidLskyFileKey('a'), true)
  assert.equal(isValidLskyFileKey('A'.repeat(64)), true)
  assert.equal(isValidLskyFileKey(''), false)
  assert.equal(isValidLskyFileKey('A'.repeat(65)), false)
  assert.equal(isValidLskyFileKey('a/b'), false)
  assert.equal(isValidLskyFileKey('../etc'), false)
  assert.equal(isValidLskyFileKey('a b'), false)
  assert.equal(isValidLskyFileKey('key?x=1'), false)
  assert.equal(isValidLskyFileKey(123), false)
  assert.equal(isValidLskyFileKey(null), false)
})

// ---------- URL 归一化 ----------

test('buildPathKeys：绝对 URL 取 pathname 并去查询串', () => {
  const keys = buildPathKeys('https://img.example.com/i/2024/05/a.jpg?x=1&y=2')
  assert.equal(keys.has('/i/2024/05/a.jpg'), true)
})

test('buildPathKeys：裸路径补前导斜杠', () => {
  const keys = buildPathKeys('i/2024/05/a.jpg')
  assert.equal(keys.has('/i/2024/05/a.jpg'), true)
})

test('buildPathKeys：解析失败的绝对 URL 原样保留（保守）', () => {
  const keys = buildPathKeys('https://')
  assert.equal(keys.has('https://'), true)
  assert.equal(keys.size, 1)
})

test('buildPathKeys：同步收录解码变体（中文名兼容）', () => {
  const keys = buildPathKeys('/i/2024/%E4%B8%AD%E6%96%87.jpg')
  assert.equal(keys.has('/i/2024/%E4%B8%AD%E6%96%87.jpg'), true)
  assert.equal(keys.has('/i/2024/中文.jpg'), true)
})

test('buildPathKeys：非法编码序列不抛错', () => {
  const keys = buildPathKeys('/i/100%.jpg')
  assert.equal(keys.has('/i/100%.jpg'), true)
})

// ---------- 富文本 / block 收集 ----------

test('extractPlainTextUrls：识别 markdown 图片语法中的 URL', () => {
  const urls = extractPlainTextUrls('看图 ![](https://a.example/i/c.jpg) 结束')
  assert.deepEqual(urls, ['https://a.example/i/c.jpg'])
})

test('collectRichTextUrls：href 与明文 URL 都收集', () => {
  const out = []
  collectRichTextUrls(
    [
      { href: 'https://x.example/a.png', plain_text: 'a' },
      { plain_text: '来源 https://y.example/b.png' },
      { plain_text: '无链接文字' },
    ],
    out
  )
  assert.deepEqual(out, ['https://x.example/a.png', 'https://y.example/b.png'])
})

test('collectBlockUrls：递归 children（加密 callout 内图片）并识别子数据库', () => {
  const out = []
  const childDbIds = new Set()
  collectBlockUrls(
    {
      type: 'callout',
      callout: { rich_text: [{ plain_text: 'LOCK:123' }] },
      children: [
        {
          type: 'image',
          image: { type: 'external', external: { url: 'https://img.example/i/in-lock.jpg' } },
          children: [],
        },
        {
          type: 'toggle',
          toggle: { rich_text: [{ plain_text: '折叠' }] },
          children: [
            {
              type: 'image',
              image: { type: 'file', file: { url: 'https://notion.example/secure/t.jpg' } },
              children: [],
            },
          ],
        },
        { type: 'child_database', child_database: { title: 'Friends' }, id: 'db-123' },
      ],
    },
    out,
    childDbIds
  )
  assert.ok(out.includes('https://img.example/i/in-lock.jpg'))
  assert.ok(out.includes('https://notion.example/secure/t.jpg'))
  assert.equal(childDbIds.has('db-123'), true)
})

test('collectPageObjectUrls：cover/icon/url/files/rich_text 属性都收集', () => {
  const out = []
  collectPageObjectUrls(
    {
      cover: { type: 'external', external: { url: 'https://img.example/cover.jpg' } },
      icon: { type: 'external', external: { url: 'https://img.example/icon.png' } },
      properties: {
        link: { type: 'url', url: 'https://img.example/prop-url.jpg' },
        files: {
          type: 'files',
          files: [{ type: 'external', external: { url: 'https://img.example/avatar.png' } }],
        },
        excerpt: {
          type: 'rich_text',
          rich_text: [{ plain_text: '文案 https://img.example/in-text.jpg' }],
        },
        title: { type: 'title', title: [{ plain_text: '标题' }] },
      },
    },
    out
  )
  assert.ok(out.includes('https://img.example/cover.jpg'))
  assert.ok(out.includes('https://img.example/icon.png'))
  assert.ok(out.includes('https://img.example/prop-url.jpg'))
  assert.ok(out.includes('https://img.example/avatar.png'))
  assert.ok(out.includes('https://img.example/in-text.jpg'))
})

// ---------- 孤立判定（保守策略走查） ----------

function makeFile(fields) {
  return {
    key: 'k1',
    name: 'a.jpg',
    size: 12,
    date: '2026-08-01 10:00:00',
    pathname: '/i/2024/a.jpg',
    url: 'https://img.example/i/2024/a.jpg',
    ...fields,
  }
}

test('detectOrphanFiles：未引用的文件判为孤立', () => {
  const refKeys = buildReferenceKeySet(['https://other.example/x.jpg'])
  const orphans = detectOrphanFiles([makeFile({})], refKeys, 'https://pub.example')
  assert.equal(orphans.length, 1)
  assert.equal(orphans[0].key, 'k1')
})

test('detectOrphanFiles：跨域名 pathname 相同视为被引用（origin 切换兼容）', () => {
  const refKeys = buildReferenceKeySet(['https://img.old.example/i/2024/a.jpg'])
  const orphans = detectOrphanFiles(
    [makeFile({ pathname: '/i/2024/a.jpg', url: 'https://img.new.example/i/2024/a.jpg' })],
    refKeys,
    'https://pub.example'
  )
  assert.equal(orphans.length, 0)
})

test('detectOrphanFiles：links.url 与 pathname 路由前缀差异不误判（disk_r 场景）', () => {
  const referenceIndex = buildReferenceIndex([
    'https://img.example/disk_r/2026/07/03/6a468ee153ab9.jpg',
  ])
  // 引用是 /disk_r/... 而 pathname 字段没有该前缀 → 末段兜底 / url 键应命中
  const orphans = detectOrphanFiles(
    [
      makeFile({
        key: 'k9',
        pathname: '2026/07/03/6a468ee153ab9.jpg',
        url: 'https://img.example/disk_r/2026/07/03/6a468ee153ab9.jpg',
      }),
    ],
    referenceIndex,
    'https://pub.example'
  )
  assert.equal(orphans.length, 0)
})

test('detectOrphanFiles：编码差异仍视为被引用（保守）', () => {
  const refKeys = buildReferenceKeySet(['https://img.example/i/%E4%B8%AD.jpg'])
  const orphans = detectOrphanFiles(
    [makeFile({ pathname: '/i/中.jpg', url: 'https://img.example/i/中.jpg' })],
    refKeys,
    'https://pub.example'
  )
  assert.equal(orphans.length, 0)
})

test('detectOrphanFiles：key 非法 / 无 pathname 无 url 的条目不判孤立（宁可不删）', () => {
  const refKeys = buildReferenceKeySet([])
  const orphans = detectOrphanFiles(
    [
      makeFile({ key: '../evil' }),
      makeFile({ key: 'k2', pathname: '', url: '' }),
    ],
    refKeys,
    'https://pub.example'
  )
  assert.equal(orphans.length, 0)
})

test('detectOrphanFiles：pathname 为空时用 url 解析；url 兜底拼公开域名', () => {
  const refKeys = buildReferenceKeySet([])
  const orphans = detectOrphanFiles(
    [makeFile({ key: 'k3', pathname: '', url: 'https://img.example/i/2024/b.jpg' })],
    refKeys,
    'https://pub.example'
  )
  assert.equal(orphans.length, 1)
  assert.equal(orphans[0].url, 'https://img.example/i/2024/b.jpg')

  const orphans2 = detectOrphanFiles(
    [makeFile({ key: 'k4', url: '' })],
    refKeys,
    'https://pub.example'
  )
  assert.equal(orphans2[0].url, 'https://pub.example/i/2024/a.jpg')
})

test('joinPublicAssetUrl：拼接公开地址', () => {
  assert.equal(joinPublicAssetUrl('https://pub.example/', '/i/a.jpg'), 'https://pub.example/i/a.jpg')
  assert.equal(joinPublicAssetUrl('', '/i/a.jpg'), '')
})

// ---------- 兰空列表分页（mock，不触网） ----------

test('fetchAllLskyImages：按 last_page 翻页聚合', async () => {
  const calls = []
  global.fetch = async (input) => {
    calls.push(String(input))
    const url = new URL(input)
    const page = Number(url.searchParams.get('page'))
    if (page === 1) {
      return new Response(
        JSON.stringify({
          status: true,
          data: {
            current_page: 1,
            last_page: 2,
            total: 3,
            data: [
              { key: 'k1', name: 'one.png', origin_name: 'one.png', size: 10, pathname: '/i/a.png', links: { url: 'https://images.example/i/a.png' } },
              { key: 'k2', size: '20', date: '2026-01-01', pathname: '/i/b.png', links: {} },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }
    return new Response(
      JSON.stringify({
        status: true,
        data: {
          current_page: 2,
          last_page: 2,
          total: 3,
          data: [
            { key: 'k3', size: 30, pathname: '/i/c.png' },
          ],
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }

  const images = await fetchAllLskyImages('https://images.example', 'Bearer t')
  assert.equal(images.length, 3)
  assert.equal(images[0].url, 'https://images.example/i/a.png')
  assert.equal(images[1].size, 20)
  assert.equal(images[1].date, '2026-01-01')
  assert.equal(calls.length, 2)
})

test('fetchAllLskyImages：接口报错时抛出业务信息', async () => {
  global.fetch = async () =>
    new Response(JSON.stringify({ status: false, message: '未授权的 Token' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  await assert.rejects(
    () => fetchAllLskyImages('https://images.example', 'Bearer bad'),
    /未授权的 Token/
  )
})

// ---------- 回收站存储（localStorage mock） ----------

test('回收站：追加/去重/恢复/非法条目过滤', () => {
  storageData.clear()
  trashStore.saveLskyTrash([])
  const now = Date.now()
  trashStore.addLskyTrashItems([
    { key: 'k1', name: 'a.jpg', size: 10, url: 'https://x/i/a.jpg', trashedAt: now },
    { key: 'k2', name: 'b.jpg', size: 20, url: '', trashedAt: now },
    { key: '../bad', name: 'evil', size: 1, trashedAt: now },
  ])
  let list = trashStore.listLskyTrash()
  assert.equal(list.length, 2)
  assert.equal(list[0].key, 'k1')

  // 同 key 重新移入 → 覆盖并重新计时
  trashStore.addLskyTrashItems([{ key: 'k1', name: 'a2.jpg', size: 11, trashedAt: now + 5000 }])
  list = trashStore.listLskyTrash()
  assert.equal(list.length, 2)
  assert.equal(list.find((e) => e.key === 'k1').name, 'a2.jpg')

  // 恢复
  trashStore.removeLskyTrashKeys(['k1'])
  list = trashStore.listLskyTrash()
  assert.equal(list.length, 1)
  assert.equal(list[0].key, 'k2')
})

test('回收站：7 天到期判定（含临界点）', () => {
  storageData.clear()
  const DAY = trashStore.LSKY_TRASH_RETENTION_MS / 7
  const now = Date.now()
  trashStore.saveLskyTrash([
    { key: 'fresh', trashedAt: now - 6 * DAY },
    { key: 'exact', trashedAt: now - trashStore.LSKY_TRASH_RETENTION_MS },
    { key: 'stale', trashedAt: now - 8 * DAY },
  ])
  const list = trashStore.listLskyTrash()
  const fresh = list.find((e) => e.key === 'fresh')
  const exact = list.find((e) => e.key === 'exact')
  const stale = list.find((e) => e.key === 'stale')
  assert.equal(trashStore.isLskyTrashExpired(fresh), false)
  assert.equal(trashStore.getLskyTrashRemainingMs(fresh) > 0, true)
  assert.equal(trashStore.isLskyTrashExpired(exact), true)
  assert.equal(trashStore.isLskyTrashExpired(stale), true)
})

test('回收站：清理历史最多保留 50 条（新条目在前）', () => {
  storageData.clear()
  const entries = Array.from({ length: 60 }, (_, i) => ({
    key: `k${i}`,
    name: `f${i}.jpg`,
    size: 1,
  }))
  trashStore.pushLskyTrashHistory(entries)
  let history = trashStore.listLskyTrashHistory()
  assert.equal(history.length, trashStore.LSKY_TRASH_HISTORY_MAX)
  assert.equal(history.length, 50)
  assert.equal(history[0].key, 'k0')
  assert.equal(history[0].deletedAt > 0, true)

  trashStore.pushLskyTrashHistory([{ key: 'new', name: 'n.jpg', size: 2 }])
  history = trashStore.listLskyTrashHistory()
  assert.equal(history.length, 50)
  assert.equal(history[0].key, 'new')

  trashStore.clearLskyTrashHistory()
  assert.equal(trashStore.listLskyTrashHistory().length, 0)
})

// ---------- 删除 API（mock，绝不触网真删） ----------

test('删除 API：未登录返回 401 且不发出任何请求', async () => {
  const res = createResponse()
  await deleteHandler(createJsonRequest({ body: { keys: ['abc'] } }), res)
  assert.equal(res.statusCode, 401)
  assert.equal(fetchCalls.length, 0)
})

test('删除 API：keys 为空返回 400', async () => {
  const res = createResponse()
  await deleteHandler(
    createJsonRequest({ authorization: `Basic ${authValue()}`, body: { keys: [] } }),
    res
  )
  assert.equal(res.statusCode, 400)
  assert.equal(fetchCalls.length, 0)
})

test('删除 API：非法 key（路径注入 / 超长 / 非字符串）整体拒绝', async () => {
  for (const keys of [['../etc/passwd'], ['a b'], ['x'.repeat(65)], [123], ['ok', 'bad/key']]) {
    const res = createResponse()
    await deleteHandler(
      createJsonRequest({ authorization: `Basic ${authValue()}`, body: { keys } }),
      res
    )
    assert.equal(res.statusCode, 400, `keys=${JSON.stringify(keys)} 应被拒绝`)
    assert.equal(fetchCalls.length, 0)
  }
})

test('删除 API：合法 key 走服务端代理并逐条回传结果', async () => {
  const res = createResponse()
  await deleteHandler(
    createJsonRequest({ authorization: `Basic ${authValue()}`, body: { keys: ['abc', 'XYZ_9'] } }),
    res
  )
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.results.length, 2)
  assert.equal(res.body.results[0].ok, true)
  assert.equal(fetchCalls.length, 2)
  assert.equal(fetchCalls[0].input, 'https://images.example/api/v1/images/abc')
  assert.equal(fetchCalls[1].input, 'https://images.example/api/v1/images/XYZ_9')
  assert.equal(fetchCalls[0].init.method, 'DELETE')
  assert.equal(fetchCalls[0].init.headers.Authorization, 'Bearer p6-test-token')
})

// ---------- 扫描 API 鉴权 ----------

test('扫描 API：非 GET 返回 405', async () => {
  const res = createResponse()
  await scanHandler({ method: 'POST', headers: {}, cookies: {} }, res)
  assert.equal(res.statusCode, 405)
})

test('扫描 API：未登录返回 401 且不发出任何请求', async () => {
  const res = createResponse()
  await scanHandler({ method: 'GET', headers: {}, cookies: {} }, res)
  assert.equal(res.statusCode, 401)
  assert.equal(fetchCalls.length, 0)
  assert.match(res.headers['cache-control'], /no-store/)
})
