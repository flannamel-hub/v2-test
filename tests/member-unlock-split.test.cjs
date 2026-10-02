const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { beforeEach, test } = require('node:test')
const babel = require('@babel/core')

const repoRoot = path.resolve(__dirname, '..')
const originalResolveFilename = Module._resolveFilename
const originalTsLoader = require.extensions['.ts']

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
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

const unlockHandler = require('../src/pages/api/post/unlock.ts').default
const { splitBlocksOnMemberMarker } = require('../src/lib/blog/memberContent.ts')

Module._resolveFilename = originalResolveFilename
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

const getBlogDataStub = require('./stubs/member-content-getblogdata-stub.cjs')
const getBlocksStub = require('./stubs/member-content-getblocks-stub.cjs')

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

const PASSWORD = 'secret123'

function makeProtectedPost() {
  return {
    id: 'page-1',
    properties: {
      article_password: {
        type: 'rich_text',
        rich_text: [{ type: 'text', plain_text: PASSWORD }],
      },
    },
  }
}

function createRequest({ method = 'POST', body } = {}) {
  return { method, headers: { host: 'blog.example.com' }, cookies: {}, body }
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
  }
}

beforeEach(() => {
  getBlogDataStub.__reset()
  getBlocksStub.__reset()
})

// --- P0:密码 + 会员分隔线组合不得泄露会员区 -------------------------------------------

test('P0 正确密码 unlock → 响应 blocks 只含公开区,不含会员区文本', async () => {
  getBlogDataStub.__setPostBySlug(makeProtectedPost())
  getBlocksStub.__setBlocks([PUBLIC_A, MARKER_BLOCK, SECRET_A, SECRET_B])

  const res = createResponse()
  await unlockHandler(
    createRequest({ body: { slug: 'post-combo', password: PASSWORD } }),
    res
  )

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.equal(typeof res.body.token, 'string')

  const raw = JSON.stringify(res.body)
  assert.equal(raw.includes('MEMBER_SECRET_A'), false)
  assert.equal(raw.includes('MEMBER_SECRET_B'), false)
  assert.equal(raw.includes('MARKER_CHILD'), false)
  assert.equal(raw.includes('PUBLIC_INTRO'), true)

  const expected = splitBlocksOnMemberMarker([
    PUBLIC_A,
    MARKER_BLOCK,
    SECRET_A,
    SECRET_B,
  ])
  assert.deepEqual(res.body.blocks, expected.publicBlocks)
  assert.deepEqual(res.body.blocks, [PUBLIC_A])
})

test('P0 token 通道同样切分(token 验证通过 → 只返回公开区)', async () => {
  getBlogDataStub.__setPostBySlug(makeProtectedPost())
  getBlocksStub.__setBlocks([PUBLIC_A, MARKER_BLOCK, SECRET_A])

  // 先拿 token
  const first = createResponse()
  await unlockHandler(
    createRequest({ body: { slug: 'post-combo', password: PASSWORD } }),
    first
  )
  const token = first.body.token

  const second = createResponse()
  await unlockHandler(
    createRequest({ body: { slug: 'post-combo', token } }),
    second
  )
  assert.equal(second.statusCode, 200)
  assert.deepEqual(second.body.blocks, [PUBLIC_A])
  assert.equal(JSON.stringify(second.body).includes('MEMBER_SECRET_A'), false)
})

test('回归:无 marker 文章 unlock 响应不变(全量公开)', async () => {
  getBlogDataStub.__setPostBySlug(makeProtectedPost())
  const plainBlocks = [PUBLIC_A, para('p2', 'MORE_PUBLIC')]
  getBlocksStub.__setBlocks(plainBlocks)

  const res = createResponse()
  await unlockHandler(
    createRequest({ body: { slug: 'post-plain', password: PASSWORD } }),
    res
  )
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.blocks, plainBlocks)
})

test('回归:错误密码仍 401(切分不影响鉴权分支)', async () => {
  getBlogDataStub.__setPostBySlug(makeProtectedPost())
  getBlocksStub.__setBlocks([PUBLIC_A, MARKER_BLOCK, SECRET_A])

  const res = createResponse()
  await unlockHandler(
    createRequest({ body: { slug: 'post-combo', password: 'wrong' } }),
    res
  )
  assert.equal(res.statusCode, 401)
  assert.equal(res.body.success, false)
  assert.equal(getBlocksStub.__getCalls(), 0)
})
