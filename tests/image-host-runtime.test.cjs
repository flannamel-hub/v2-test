const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { test } = require('node:test')
const babel = require('@babel/core')

const repoRoot = path.resolve(__dirname, '..')
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

const {
  normalizeImageHostConfig,
  normalizeImageHostOrigin,
  normalizePublicImageHostConfig,
  normalizeUploadedAssetUrl,
  rewriteManagedAssetUrl,
  rewriteManagedSrcSet,
} = require('../src/lib/media/rewriteManagedAssetUrl.ts')

Module._resolveFilename = originalResolveFilename
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

const runtimeConfig = normalizeImageHostConfig({
  version: 2,
  upload_api_origin: 'https://img.vlogs.cc',
  public_asset_origin: 'https://img.vlogs.cc',
  legacy_asset_origins: ['https://img.x1file.top'],
})

test('origin 仅接受规范化 HTTPS 域名', () => {
  assert.equal(
    normalizeImageHostOrigin(' HTTPS://IMG.VLOGS.CC:443 '),
    'https://img.vlogs.cc'
  )
  assert.equal(
    normalizeImageHostOrigin('https://img.vlogs.cc:8443'),
    'https://img.vlogs.cc:8443'
  )
  for (const invalid of [
    'http://img.vlogs.cc',
    'https://img.vlogs.cc/path',
    'https://user@img.vlogs.cc',
    'https://127.0.0.1',
    'https://localhost',
  ]) {
    assert.throws(() => normalizeImageHostOrigin(invalid), invalid)
  }
})

test('共享配置规范化、去重并拒绝异常配置', () => {
  assert.deepEqual(
    normalizePublicImageHostConfig({
      version: 3,
      public_asset_origin: 'https://img.vlogs.cc',
      legacy_asset_origins: [
        'https://img.x1file.top',
        'HTTPS://IMG.X1FILE.TOP:443',
        'https://img.vlogs.cc',
      ],
    }),
    {
      version: 3,
      publicAssetOrigin: 'https://img.vlogs.cc',
      legacyAssetOrigins: ['https://img.x1file.top'],
    }
  )
  assert.throws(() =>
    normalizePublicImageHostConfig({
      version: -1,
      public_asset_origin: 'https://img.vlogs.cc',
      legacy_asset_origins: [],
    })
  )
  assert.throws(() =>
    normalizePublicImageHostConfig({
      version: 1,
      public_asset_origin: 'https://img.vlogs.cc/path',
      legacy_asset_origins: [],
    })
  )
})

test('只精确替换允许的旧 origin，并保留 path/query/hash', () => {
  const source =
    'https://img.x1file.top/disk_r/2026/a.jpg?width=1200&fit=cover#preview'
  assert.equal(
    rewriteManagedAssetUrl(source, runtimeConfig),
    'https://img.vlogs.cc/disk_r/2026/a.jpg?width=1200&fit=cover#preview'
  )
  assert.equal(
    rewriteManagedAssetUrl('https://img.x1file.top.evil.test/a.jpg', runtimeConfig),
    'https://img.x1file.top.evil.test/a.jpg'
  )
  assert.equal(
    rewriteManagedAssetUrl('https://s3.amazonaws.com/notion/file.jpg', runtimeConfig),
    'https://s3.amazonaws.com/notion/file.jpg'
  )
  for (const value of ['/relative.jpg', 'blob:test', 'data:image/png;base64,abc']) {
    assert.equal(rewriteManagedAssetUrl(value, runtimeConfig), value)
  }
  const current = 'https://img.vlogs.cc/disk_r/2026/a.jpg?x=1#p'
  assert.equal(rewriteManagedAssetUrl(current, runtimeConfig), current)
})

test('上传返回 URL 只接受受管 origin 并统一为公开 origin', () => {
  assert.equal(
    normalizeUploadedAssetUrl(
      'https://img.x1file.top/disk_r/a.jpg?x=1#p',
      runtimeConfig
    ),
    'https://img.vlogs.cc/disk_r/a.jpg?x=1#p'
  )
  assert.equal(
    normalizeUploadedAssetUrl('https://img.vlogs.cc/disk_r/a.jpg', runtimeConfig),
    'https://img.vlogs.cc/disk_r/a.jpg'
  )
  assert.throws(() =>
    normalizeUploadedAssetUrl('https://evil.example/disk_r/a.jpg', runtimeConfig)
  )
  assert.throws(() =>
    normalizeUploadedAssetUrl('http://img.vlogs.cc/disk_r/a.jpg', runtimeConfig)
  )
})

test('srcset 保留描述符，data srcset 完全不改写', () => {
  assert.equal(
    rewriteManagedSrcSet(
      'https://img.x1file.top/a.jpg 1x, https://img.x1file.top/b.jpg?x=1 2x',
      runtimeConfig
    ),
    'https://img.vlogs.cc/a.jpg 1x, https://img.vlogs.cc/b.jpg?x=1 2x'
  )
  const dataSrcSet = 'data:image/svg+xml;base64,abc 1x'
  assert.equal(rewriteManagedSrcSet(dataSrcSet, runtimeConfig), dataSrcSet)
})
