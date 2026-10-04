/**
 * 站点会员 B4-W1:memberQr(QR 上传解码)单测。
 * - 纯函数护栏:文件类型/大小(bad_file 独立错误类,§10.2-Q5)、等比缩放;
 * - 降级链选择逻辑:依赖注入伪 DETECTOR / 伪 jsQR(§10.5:对齐 member-routes 基建风格);
 * - 规范化合并:解码文本 → normalizeMemberAccessKey。
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { test } = require('node:test')
const babel = require('@babel/core')

const repoRoot = path.resolve(__dirname, '..')
const srcRoot = `${path.join(repoRoot, 'src')}${path.sep}`
const originalResolveFilename = Module._resolveFilename
const originalJsLoader = require.extensions['.js']
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

const memberQr = require('../src/lib/blog/memberQr.ts')
const { normalizeMemberAccessKey } = require('../src/lib/blog/memberCenterClient.ts')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

const {
  validateMemberQrFile,
  pickMemberQrScale,
  decodeMemberQrFromPixels,
  decodeMemberQrFromFile,
  MEMBER_QR_MAX_FILE_BYTES,
} = memberQr

function makePixels(text = '') {
  // 像素内容对注入链无意义(伪 detector/jsqr 不读像素)
  return { data: new Uint8ClampedArray(4), width: 1, height: 1, text }
}

// --- 文件护栏(Q5:bad_file 独立类) -------------------------------------------------

test('validateMemberQrFile:image/* 且 ≤8MB 通过', () => {
  assert.equal(validateMemberQrFile({ type: 'image/png', size: 1024 }), true)
  assert.equal(validateMemberQrFile({ type: 'IMAGE/JPEG', size: MEMBER_QR_MAX_FILE_BYTES }), true)
})

test('validateMemberQrFile:非 image/* → bad_file 语义(false)', () => {
  assert.equal(validateMemberQrFile({ type: 'application/pdf', size: 10 }), false)
  assert.equal(validateMemberQrFile({ type: 'text/plain', size: 10 }), false)
  assert.equal(validateMemberQrFile({ type: '', size: 10 }), false)
  assert.equal(validateMemberQrFile({ size: 10 }), false)
})

test('validateMemberQrFile:>8MB → false;size 非法 → false', () => {
  assert.equal(
    validateMemberQrFile({ type: 'image/png', size: MEMBER_QR_MAX_FILE_BYTES + 1 }),
    false
  )
  assert.equal(validateMemberQrFile({ type: 'image/png' }), false)
})

test('decodeMemberQrFromFile:非 image 文件 → bad_file(node 环境直返,不触 bitmap)', async () => {
  const fakeFile = { type: 'text/plain', size: 5 }
  const result = await decodeMemberQrFromFile(fakeFile)
  assert.deepEqual(result, { ok: false, error: 'bad_file' })
})

// --- 等比缩放 ------------------------------------------------------------------------

test('pickMemberQrScale:≤1600 → 1;超限 → maxEdge/longest;非法尺寸 → 1', () => {
  assert.equal(pickMemberQrScale(800, 600), 1)
  assert.equal(pickMemberQrScale(1600, 900), 1)
  assert.ok(pickMemberQrScale(3200, 2400) - 0.5 < 1e-9)
  assert.equal(pickMemberQrScale(0, 0), 1)
  assert.equal(pickMemberQrScale(-5, 100), 1)
  assert.equal(pickMemberQrScale(NaN, 100), 1)
  assert.ok(pickMemberQrScale(100, 4000, 1000) - 0.25 < 1e-9)
})

// --- 降级链(依赖注入) ---------------------------------------------------------------

test('降级链:原生 detector 命中 → 直接返回,jsQR 不被装载', async () => {
  let jsQrLoaded = false
  const result = await decodeMemberQrFromPixels(makePixels(), {
    getDetector: () => ({ detect: async () => [{ rawValue: ' mem-30 ' }] }),
    loadJsQr: async () => {
      jsQrLoaded = true
      return () => ({ data: 'SHOULD-NOT-RUN' })
    },
  })
  assert.deepEqual(result, { ok: true, text: ' mem-30 ' })
  assert.equal(jsQrLoaded, false)
})

test('降级链:detector 抛错 → jsQR 兜底命中', async () => {
  const result = await decodeMemberQrFromPixels(makePixels(), {
    getDetector: () => ({ detect: async () => { throw new Error('detector boom') } }),
    loadJsQr: async () => (data, w, h) => {
      assert.ok(data instanceof Uint8ClampedArray)
      assert.equal(w, 1)
      assert.equal(h, 1)
      return { data: 'MEM-30' }
    },
  })
  assert.deepEqual(result, { ok: true, text: 'MEM-30' })
})

test('降级链:detector 空结果/纯空白文本 → jsQR 兜底', async () => {
  const empty = await decodeMemberQrFromPixels(makePixels(), {
    getDetector: () => ({ detect: async () => [] }),
    loadJsQr: async () => () => ({ data: 'FALLBACK' }),
  })
  assert.deepEqual(empty, { ok: true, text: 'FALLBACK' })

  const blank = await decodeMemberQrFromPixels(makePixels(), {
    getDetector: () => ({ detect: async () => [{ rawValue: '   ' }] }),
    loadJsQr: async () => () => ({ data: 'FALLBACK2' }),
  })
  assert.deepEqual(blank, { ok: true, text: 'FALLBACK2' })
})

test('降级链:detector 不可用(null)→ jsQR 直走', async () => {
  const result = await decodeMemberQrFromPixels(makePixels(), {
    getDetector: () => null,
    loadJsQr: async () => () => ({ data: 'DIRECT' }),
  })
  assert.deepEqual(result, { ok: true, text: 'DIRECT' })
})

test('降级链:两级全失败 → decode_failed', async () => {
  const bothMiss = await decodeMemberQrFromPixels(makePixels(), {
    getDetector: () => ({ detect: async () => [] }),
    loadJsQr: async () => () => null,
  })
  assert.deepEqual(bothMiss, { ok: false, error: 'decode_failed' })

  const loadFail = await decodeMemberQrFromPixels(makePixels(), {
    getDetector: () => null,
    loadJsQr: async () => null,
  })
  assert.deepEqual(loadFail, { ok: false, error: 'decode_failed' })

  const jsQrThrows = await decodeMemberQrFromPixels(makePixels(), {
    getDetector: () => null,
    loadJsQr: async () => () => { throw new Error('jsqr boom') },
  })
  assert.deepEqual(jsQrThrows, { ok: false, error: 'decode_failed' })

  const blankText = await decodeMemberQrFromPixels(makePixels(), {
    getDetector: () => null,
    loadJsQr: async () => () => ({ data: '  ' }),
  })
  assert.deepEqual(blankText, { ok: false, error: 'decode_failed' })
})

test('降级链:node 环境默认 detector 为 null(无 window)且未注入 → 走注入 jsQR', async () => {
  // getDetector 未注入时,resolveDefaultQrDetector 在 node 下必须返回 null
  const result = await decodeMemberQrFromPixels(makePixels(), {
    loadJsQr: async () => () => ({ data: 'NODE-DEFAULT' }),
  })
  assert.deepEqual(result, { ok: true, text: 'NODE-DEFAULT' })
})

// --- 规范化合并(解码文本 → normalizeMemberAccessKey) ------------------------------

test('规范化合并:解码文本含空白/连字符/全角 → 大写紧凑', () => {
  assert.equal(normalizeMemberAccessKey(' mem-30 '), 'MEM30')
  assert.equal(normalizeMemberAccessKey('a b\u3000c-d－e–f—g'), 'ABCDEFG')
  assert.equal(normalizeMemberAccessKey('  '), '')
})

test('规范化合并:detector 命中 + 调用侧规范化(弹窗填充链)', async () => {
  const result = await decodeMemberQrFromPixels(makePixels(), {
    getDetector: () => ({ detect: async () => [{ rawValue: ' mem - 30 ' }] }),
    loadJsQr: async () => null,
  })
  assert.equal(result.ok, true)
  assert.equal(normalizeMemberAccessKey(result.text), 'MEM30')
})
