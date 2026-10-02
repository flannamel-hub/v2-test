/** 站点会员 B3:post.js 四路 round-trip / 收敛 路由级 stub 测试(§9.2)。
 * 桩法参照 tests/member-content-api.test.cjs;必桩四件(§16-M6 固定清单):
 * @notionhq/client / notion-to-md / @/src/lib/media/imageHostConfig / @/src/lib/admin/verifyAdminRequest;
 * @/src/lib/blog/contentRevalidation 以最小形状并入 notion 桩(真模块会拉入主题 tsx 链);
 * memberContentCache 等纯内存模块留真实。 */
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

const postHandler = require('../src/pages/api/admin/post.js').default
const notionStub = require('./stubs/member-editor-notion-stub.cjs')
const n2mStub = require('./stubs/member-editor-n2m-stub.cjs')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

// --- 夹具 -----------------------------------------------------------------

const PAGE_ID = 'page-1'

function paraBlock(id, text) {
  return {
    id,
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', plain_text: text }] },
    children: [],
  }
}

function memberCalloutBlock(id, text = 'MEMBER:') {
  return {
    id,
    type: 'callout',
    callout: { rich_text: [{ type: 'text', plain_text: text }] },
    children: [],
  }
}

function retrievePage() {
  return { id: PAGE_ID, properties: { title: { type: 'title' } }, cover: null }
}

function editorText(content) {
  return { id: `t-${Math.random()}`, type: 'text', content }
}

function editorMember() {
  return { id: `m-${Math.random()}`, type: 'member' }
}

/** 从捕获的 append 实参中展开全部写入的 Notion 块 */
function appendedNotionBlocks() {
  return notionStub.__getAppendedCalls().flatMap((c) => c.children || [])
}

/** 写侧产物中的 MEMBER: callout(按 B3 标准形态文本过滤) */
function memberCallouts(blocks) {
  return (blocks || []).filter(
    (b) =>
      b.type === 'callout' &&
      b.callout &&
      Array.isArray(b.callout.rich_text) &&
      b.callout.rich_text[0] &&
      b.callout.rich_text[0].text &&
      b.callout.rich_text[0].text.content === 'MEMBER:'
  )
}

function createRequest({ method = 'POST', query, body } = {}) {
  return {
    method,
    headers: { host: 'blog.example.com' },
    cookies: {},
    query: query ?? {},
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

async function runPostUpdate(body) {
  notionStub.__setPagesRetrieve(async () => retrievePage())
  const res = createResponse()
  await postHandler(createRequest({ method: 'POST', query: { id: body.id }, body }), res)
  assert.equal(res.statusCode, 200, JSON.stringify(res.body))
  return res
}

async function runGetImport(rawBlocks, pageToMarkdownResult = []) {
  notionStub.__setPagesRetrieve(async () => retrievePage())
  notionStub.__setBlocksChildren(PAGE_ID, rawBlocks)
  n2mStub.__setPageToMarkdown(pageToMarkdownResult)
  const res = createResponse()
  await postHandler(createRequest({ method: 'GET', query: { id: PAGE_ID } }), res)
  assert.equal(res.statusCode, 200, JSON.stringify(res.body))
  return res
}

/** 写侧产物 rich_text 无 plain_text 字段;再导回时镜像补齐(模拟真实 Notion fetch 形态) */
function asNotionFetched(blocks) {
  return blocks.map((b, i) => {
    const payload = b[b.type]
    if (!payload || !Array.isArray(payload.rich_text)) return { ...b, id: `f-${i}` }
    return {
      ...b,
      id: `f-${i}`,
      [b.type]: {
        ...payload,
        rich_text: payload.rich_text.map((r) => ({
          ...r,
          plain_text: r.plain_text != null ? r.plain_text : (r.text && r.text.content) || '',
        })),
      },
    }
  })
}

beforeEach(() => {
  notionStub.__reset()
  n2mStub.__reset()
})

// --- POST · 结构化(更新路径,带 id) ----------------------------------------

test('POST 结构化(更新路径):多条 member 收敛恰 1 条,位置在 textA 之后,形状=标准形态', async () => {
  await runPostUpdate({
    id: PAGE_ID,
    title: 'T',
    blocksData: [editorText('A'), editorMember(), editorText('B'), editorMember(), editorText('C')],
  })
  const written = appendedNotionBlocks()
  // 收敛:textA + 1 条 marker + textB + textC = 4 块
  assert.equal(written.length, 4)
  const markers = memberCallouts(written)
  assert.equal(markers.length, 1)
  assert.equal(written.indexOf(markers[0]), 1)
  assert.equal(written[0].paragraph.rich_text[0].text.content, 'A')
  // callout 形状(B2 附录 B 标准形态)
  const callout = markers[0].callout
  assert.equal(callout.rich_text.length, 1)
  assert.equal(callout.rich_text[0].text.content, 'MEMBER:')
  assert.equal(callout.rich_text[0].annotations, undefined)
  assert.equal(callout.children, undefined)
  assert.equal(callout.icon.type, 'emoji')
  assert.equal(callout.icon.emoji, '🔒')
  assert.equal(callout.color, 'gray_background')
})

// --- POST · 结构化(新建路径,无 id) ----------------------------------------

test('POST 结构化(新建路径):pages.create children 同样收敛恰 1 条 MEMBER: callout', async () => {
  notionStub.__setDatabasesProperties({ title: { type: 'title' } })
  const res = createResponse()
  await postHandler(
    createRequest({
      method: 'POST',
      body: { title: 'T', blocksData: [editorMember(), editorText('A'), editorMember()] },
    }),
    res
  )
  assert.equal(res.statusCode, 200, JSON.stringify(res.body))
  const created = notionStub.__getCreatedPages()
  assert.equal(created.length, 1)
  const markers = memberCallouts(created[0].children)
  assert.equal(markers.length, 1)
  assert.equal(created[0].children.indexOf(markers[0]), 0)
})

// --- POST · md 路径 ---------------------------------------------------------

test('POST md 路径:content 含两个 :::member → append 恰 1 条 MEMBER: callout(空行成段)', async () => {
  await runPostUpdate({
    id: PAGE_ID,
    title: 'T',
    content: 'para A\n\n:::member\n\npara B\n\n:::member\n\npara C',
  })
  const written = appendedNotionBlocks()
  assert.equal(memberCallouts(written).length, 1)
  // 段落不丢:para A / para B / para C 均在
  const paras = written.filter((b) => b.type === 'paragraph').map((b) => b.paragraph.rich_text[0].text.content)
  assert.deepEqual(paras, ['para A', 'para B', 'para C'])
})

// --- GET · 导入 -------------------------------------------------------------

test('GET 导入:[para, MEMBER: callout, para] → editorBlocks = [text, member, text]', async () => {
  const res = await runGetImport([
    paraBlock('p1', 'PUBLIC'),
    memberCalloutBlock('m1'),
    paraBlock('p2', 'SECRET'),
  ])
  const types = res.body.post.editorBlocks.map((b) => b.type)
  assert.deepEqual(types, ['text', 'member', 'text'])
})

test('GET 导入:两条 marker → [member, member](均还原,不收敛)', async () => {
  const res = await runGetImport([memberCalloutBlock('m1'), memberCalloutBlock('m2')])
  const types = res.body.post.editorBlocks.map((b) => b.type)
  assert.deepEqual(types, ['member', 'member'])
})

test('GET 导入:LOCK:xxx callout 回归行为不变(专用 lock 块:文本+图片)', async () => {
  notionStub.__setBlocksChildren('lock-1', [
    { id: 'd1', type: 'divider', divider: {} },
    paraBlock('lk-1', 'secret body'),
    { id: 'img-1', type: 'image', image: { type: 'external', external: { url: 'https://img.example.com/l.png' } } },
  ])
  const res = await runGetImport([
    {
      id: 'lock-1',
      type: 'callout',
      callout: { rich_text: [{ type: 'text', plain_text: 'LOCK:pw123' }] },
      children: [],
    },
  ])
  const editorBlocks = res.body.post.editorBlocks
  assert.equal(editorBlocks.length, 1)
  assert.equal(editorBlocks[0].type, 'lock')
  assert.equal(editorBlocks[0].pwd, 'pw123')
  assert.equal(editorBlocks[0].content, 'secret body')
  assert.deepEqual(editorBlocks[0].images, ['https://img.example.com/l.png'])
})

test('GET 导入:"MEMBER: x" → text 块(附加内容不识别)', async () => {
  const res = await runGetImport([memberCalloutBlock('m1', 'MEMBER: x')])
  const editorBlocks = res.body.post.editorBlocks
  assert.equal(editorBlocks.length, 1)
  assert.equal(editorBlocks[0].type, 'text')
  assert.equal(editorBlocks[0].content, 'MEMBER: x')
})

// --- 往返幂等(口径:一轮收敛、二轮稳定;§16-M3) ---------------------------

test('往返幂等:[text,member,text,member,text] → 一轮收敛 [text,member,text],二轮不再变化', async () => {
  const input = [editorText('A'), editorMember(), editorText('B'), editorMember(), editorText('C')]

  // 第一轮:结构化保存 → Notion 写入
  await runPostUpdate({ id: PAGE_ID, title: 'T', blocksData: input })
  const notionRound1 = appendedNotionBlocks()
  assert.equal(memberCallouts(notionRound1).length, 1)

  // 第一轮:导回编辑器(相邻同侧 text 合并属预期行为,按类型序列断言)
  const res1 = await runGetImport(asNotionFetched(notionRound1))
  const round1 = res1.body.post.editorBlocks
  assert.deepEqual(round1.map((b) => b.type), ['text', 'member', 'text'])

  // 第二轮:再保存 → 再导回,序列不再变化
  notionStub.__clearAppendedCalls()
  await runPostUpdate({ id: PAGE_ID, title: 'T', blocksData: round1 })
  const notionRound2 = appendedNotionBlocks()
  assert.equal(memberCallouts(notionRound2).length, 1)
  const res2 = await runGetImport(asNotionFetched(notionRound2))
  const round2 = res2.body.post.editorBlocks
  assert.deepEqual(
    round2.map((b) => ({ type: b.type, content: b.content })),
    round1.map((b) => ({ type: b.type, content: b.content }))
  )
})

// --- GET · n2m 归一化(md 兜底路径) ----------------------------------------

test('GET n2m 归一化:"> 🔒 MEMBER:" → cleanContent 含 :::member', async () => {
  const res = await runGetImport([], [{ type: 'callout', parent: '> 🔒 MEMBER:' }])
  assert.ok(res.body.post.content.includes(':::member'))
})

test('GET n2m 归一化:"> 🔒 MEMBER: 附加" → 不转换(单段严格匹配)', async () => {
  const res = await runGetImport([], [{ type: 'callout', parent: '> 🔒 MEMBER: 附加' }])
  assert.equal(res.body.post.content.includes(':::member'), false)
})
