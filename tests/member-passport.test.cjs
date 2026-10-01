const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const crypto = require('node:crypto')
const { after, test } = require('node:test')
const babel = require('@babel/core')

const repoRoot = path.resolve(__dirname, '..')
const srcRoot = `${path.join(repoRoot, 'src')}${path.sep}`
const originalResolveFilename = Module._resolveFilename
const originalTsLoader = require.extensions['.ts']

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
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

const memberPassport = require('../src/lib/blog/memberPassport.ts')

Module._resolveFilename = originalResolveFilename
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

const {
  verifyMemberPassport,
  normalizeMemberHost,
  buildMemberSetCookie,
  buildMemberClearCookie,
  MEMBER_COOKIE_NAME,
  MEMBER_PASSPORT_TTL_SECONDS,
  __setMemberPassportKeysForTest,
} = memberPassport

// --- Ed25519 测试钥对与签发工具 ------------------------------------------------

const keyPair = crypto.generateKeyPairSync('ed25519')
const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' })
const privateKeyPem = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' })

const TEST_KID = 'test-key'
const HOST = 'blog.example.com'
const SITE_ID = '11111111-2222-4333-8444-555555555555'
const DAY = 86400
const NOW = Math.floor(Date.now() / 1000)

function b64url(input) {
  return Buffer.from(input).toString('base64url')
}

function signJwt(header, claims) {
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  const signature = crypto.sign(
    null,
    Buffer.from(signingInput),
    crypto.createPrivateKey(privateKeyPem)
  )
  return `${signingInput}.${b64url(signature)}`
}

function baseHeader(overrides = {}) {
  return { alg: 'EdDSA', typ: 'JWT', kid: TEST_KID, ...overrides }
}

function baseClaims(overrides = {}) {
  return {
    iss: 'pro-merchant-member',
    aud: HOST,
    sub: 'member-001',
    sid: SITE_ID,
    ver: 3,
    iat: NOW - 60,
    exp: NOW + 6 * DAY,
    purpose: 'passport',
    mexp: NOW + 30 * DAY,
    ...overrides,
  }
}

function verify(token, optsOverrides = {}) {
  return verifyMemberPassport(token, {
    host: HOST,
    siteId: SITE_ID,
    keys: [{ kid: TEST_KID, publicKeyPem }],
    ...optsOverrides,
  })
}

after(() => {
  __setMemberPassportKeysForTest(null)
})

// --- 正向 ----------------------------------------------------------------------

test('正向:claims 全字段(含 mexp number)验签通过', async () => {
  const result = await verify(signJwt(baseHeader(), baseClaims()))
  assert.equal(result.ok, true)
  assert.equal(result.claims.iss, 'pro-merchant-member')
  assert.equal(result.claims.aud, HOST)
  assert.equal(result.claims.sub, 'member-001')
  assert.equal(result.claims.sid, SITE_ID)
  assert.equal(result.claims.ver, 3)
  assert.equal(result.claims.purpose, 'passport')
  assert.equal(result.claims.mexp, NOW + 30 * DAY)
})

test('正向:mexp null / 缺省 均规范化为 null', async () => {
  const nullResult = await verify(signJwt(baseHeader(), baseClaims({ mexp: null })))
  assert.equal(nullResult.ok, true)
  assert.equal(nullResult.claims.mexp, null)

  const claims = baseClaims()
  delete claims.mexp
  const omittedResult = await verify(signJwt(baseHeader(), claims))
  assert.equal(omittedResult.ok, true)
  assert.equal(omittedResult.claims.mexp, null)
})

// --- 结构与 header -------------------------------------------------------------

test('unknown_kid:header kid 不在公钥表', async () => {
  const result = await verify(
    signJwt(baseHeader({ kid: 'other-kid' }), baseClaims())
  )
  assert.deepEqual(result, { ok: false, reason: 'unknown_kid' })
})

test('bad_algorithm:alg=HS256', async () => {
  const result = await verify(signJwt(baseHeader({ alg: 'HS256' }), baseClaims()))
  assert.deepEqual(result, { ok: false, reason: 'bad_algorithm' })
})

test('bad_algorithm:alg=none(带占位签名段)', async () => {
  const result = await verify(signJwt(baseHeader({ alg: 'none' }), baseClaims()))
  assert.deepEqual(result, { ok: false, reason: 'bad_algorithm' })
})

test('malformed:typ 非 JWT / kid 缺失 / "=" 填充段 / 段数错误', async () => {
  const typResult = await verify(signJwt(baseHeader({ typ: 'at+jwt' }), baseClaims()))
  assert.deepEqual(typResult, { ok: false, reason: 'malformed' })

  const kidResult = await verify(signJwt(baseHeader({ kid: '' }), baseClaims()))
  assert.deepEqual(kidResult, { ok: false, reason: 'malformed' })

  const valid = signJwt(baseHeader(), baseClaims())
  const [h, p, s] = valid.split('.')
  // 段内 '=' 填充仍保持 3 段:命中严格 base64url 字符集校验
  const padded = await verify(`${h}ab=.${p}.${s}`)
  assert.deepEqual(padded, { ok: false, reason: 'malformed' })

  const twoSegments = await verify(`${h}.${p}`)
  assert.deepEqual(twoSegments, { ok: false, reason: 'malformed' })

  const emptyToken = await verify('')
  assert.deepEqual(emptyToken, { ok: false, reason: 'malformed' })
})

// --- 签名 ----------------------------------------------------------------------

test('bad_signature:签名段被篡改', async () => {
  const valid = signJwt(baseHeader(), baseClaims())
  const [h, p, s] = valid.split('.')
  const flipped = s.endsWith('A') ? `${s.slice(0, -1)}B` : `${s.slice(0, -1)}A`
  const result = await verify(`${h}.${p}.${flipped}`)
  assert.deepEqual(result, { ok: false, reason: 'bad_signature' })
})

// --- claims 形状 ----------------------------------------------------------------

test('bad_claims:缺字段(sid 缺失)', async () => {
  const claims = baseClaims()
  delete claims.sid
  const result = await verify(signJwt(baseHeader(), claims))
  assert.deepEqual(result, { ok: false, reason: 'bad_claims' })
})

test('bad_claims:ver 非整数 / 小于 1', async () => {
  const floatResult = await verify(signJwt(baseHeader(), baseClaims({ ver: 1.5 })))
  assert.deepEqual(floatResult, { ok: false, reason: 'bad_claims' })

  const zeroResult = await verify(signJwt(baseHeader(), baseClaims({ ver: 0 })))
  assert.deepEqual(zeroResult, { ok: false, reason: 'bad_claims' })
})

test('bad_claims:mexp 非整数', async () => {
  const result = await verify(
    signJwt(baseHeader(), baseClaims({ mexp: 'tomorrow' }))
  )
  assert.deepEqual(result, { ok: false, reason: 'bad_claims' })
})

test('wrong_purpose:purpose=renew_ref', async () => {
  const result = await verify(
    signJwt(baseHeader(), baseClaims({ purpose: 'renew_ref' }))
  )
  assert.deepEqual(result, { ok: false, reason: 'wrong_purpose' })
})

// --- 时间语义 -------------------------------------------------------------------

test('expired:exp 超过 7 天宽限', async () => {
  const result = await verify(
    signJwt(baseHeader(), baseClaims({ exp: NOW - 8 * DAY }))
  )
  assert.deepEqual(result, { ok: false, reason: 'expired' })
})

test('宽限内:exp 已过 3 天仍返回 claims(交调用方判定)', async () => {
  const result = await verify(
    signJwt(baseHeader(), baseClaims({ exp: NOW - 3 * DAY }))
  )
  assert.equal(result.ok, true)
  assert.equal(result.claims.exp, NOW - 3 * DAY)
})

// --- 对象级校验 -----------------------------------------------------------------

test('sid_mismatch:opts.siteId 与 claims.sid 不一致', async () => {
  const result = await verify(signJwt(baseHeader(), baseClaims()), {
    siteId: '99999999-9999-4999-8999-999999999999',
  })
  assert.deepEqual(result, { ok: false, reason: 'sid_mismatch' })
})

test('aud_mismatch:claims.aud 与 opts.host 不一致', async () => {
  const result = await verify(signJwt(baseHeader(), baseClaims()), {
    host: 'other.example.com',
  })
  assert.deepEqual(result, { ok: false, reason: 'aud_mismatch' })
})

// --- 公钥表覆盖钩子 ---------------------------------------------------------------

test('__setMemberPassportKeysForTest:覆盖与恢复', async () => {
  __setMemberPassportKeysForTest([{ kid: TEST_KID, publicKeyPem }])
  const token = signJwt(baseHeader(), baseClaims())
  const overridden = await verifyMemberPassport(token, {
    host: HOST,
    siteId: SITE_ID,
  })
  assert.equal(overridden.ok, true)

  __setMemberPassportKeysForTest(null)
  const restored = await verifyMemberPassport(token, {
    host: HOST,
    siteId: SITE_ID,
  })
  assert.deepEqual(restored, { ok: false, reason: 'unknown_kid' })
})

// --- host 归一化与 cookie 工具 ----------------------------------------------------

test('normalizeMemberHost:trim/小写/去端口/去尾点', () => {
  assert.equal(normalizeMemberHost('  Blog.Example.COM  '), 'blog.example.com')
  assert.equal(normalizeMemberHost('blog.example.com:443'), 'blog.example.com')
  assert.equal(normalizeMemberHost('BLOG.example.com.'), 'blog.example.com')
  assert.equal(normalizeMemberHost(''), '')
})

test('buildMemberSetCookie/ClearCookie:非生产无 Secure,生产带 Secure', () => {
  const originalEnv = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'test'
    assert.equal(
      buildMemberSetCookie('jwt-value', MEMBER_PASSPORT_TTL_SECONDS),
      'sm_session=jwt-value; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax'
    )
    assert.equal(
      buildMemberClearCookie(),
      'sm_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
    )

    process.env.NODE_ENV = 'production'
    assert.equal(
      buildMemberSetCookie('jwt-value', 100),
      'sm_session=jwt-value; Path=/; Max-Age=100; HttpOnly; SameSite=Lax; Secure'
    )
    assert.equal(
      buildMemberClearCookie(),
      'sm_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure'
    )
  } finally {
    if (originalEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalEnv
  }
})

test('常量:cookie 名 / TTL / 心跳 / 宽限', () => {
  assert.equal(MEMBER_COOKIE_NAME, 'sm_session')
  assert.equal(memberPassport.MEMBER_PASSPORT_TTL_SECONDS, 604800)
  assert.equal(memberPassport.MEMBER_HEARTBEAT_SECONDS, 86400)
  assert.equal(memberPassport.MEMBER_PASSPORT_GRACE_SECONDS, 604800)
})
