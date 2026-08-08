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
const originalFetch = global.fetch
const envKeys = ['AUTH_USER', 'AUTH_PASS', 'LSKY_TOKEN', 'LSKY_URL']
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))

process.env.AUTH_USER = 'p3-test-admin'
process.env.AUTH_PASS = 'p3-test-password'
process.env.LSKY_TOKEN = 'p3-test-token'
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

const uploadHandler = require('../src/pages/api/admin/upload.js').default

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader

let fetchCalls = []

function authValue() {
  return Buffer.from(`${process.env.AUTH_USER}:${process.env.AUTH_PASS}`).toString('base64')
}

function createRequest({ authorization, cookie } = {}) {
  const req = Readable.from([Buffer.from('fake-image-bytes')])
  req.method = 'POST'
  req.headers = {
    'content-type': 'image/png',
    'x-file-name': encodeURIComponent('test.png'),
  }
  if (authorization) req.headers.authorization = authorization
  req.cookies = cookie ? { internal_auth: cookie } : {}
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
    return new Response(
      JSON.stringify({
        status: true,
        data: {
          origin_name: 'test.png',
          mimetype: 'image/png',
          links: { url: 'https://images.example/test.png' },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }
})

after(() => {
  global.fetch = originalFetch
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('未登录上传返回 401，且不会转发兰空', async () => {
  const res = createResponse()
  await uploadHandler(createRequest(), res)

  assert.equal(res.statusCode, 401)
  assert.equal(res.body.success, false)
  assert.equal(fetchCalls.length, 0)
})

test('错误 Basic 凭据返回 401，且不会转发兰空', async () => {
  const res = createResponse()
  const wrong = Buffer.from('wrong:credentials').toString('base64')
  await uploadHandler(createRequest({ authorization: `Basic ${wrong}` }), res)

  assert.equal(res.statusCode, 401)
  assert.equal(fetchCalls.length, 0)
})

test('正确 Basic 凭据可完成代理上传', async () => {
  const res = createResponse()
  await uploadHandler(
    createRequest({ authorization: `Basic ${authValue()}` }),
    res
  )

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.url, 'https://images.example/test.png')
  assert.equal(fetchCalls.length, 1)
  assert.equal(fetchCalls[0].init.headers.Authorization, 'Bearer p3-test-token')
})

test('正确 internal_auth Cookie 可完成代理上传', async () => {
  const res = createResponse()
  await uploadHandler(createRequest({ cookie: authValue() }), res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.url, 'https://images.example/test.png')
  assert.equal(fetchCalls.length, 1)
})
