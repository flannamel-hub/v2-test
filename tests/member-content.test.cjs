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

const { splitBlocksOnMemberMarker, MEMBER_MARKER_TEXT } = require('../src/lib/blog/memberContent.ts')

Module._resolveFilename = originalResolveFilename
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']

// --- 夹具 ---------------------------------------------------------------------------

function para(id, text) {
  return {
    id,
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', plain_text: text }] },
    children: [],
  }
}

function callout(id, text, children = []) {
  return {
    id,
    type: 'callout',
    callout: { rich_text: [{ type: 'text', plain_text: text }], color: 'gray_background' },
    children,
  }
}

function marker(id, children = []) {
  return callout(id, MEMBER_MARKER_TEXT, children)
}

// --- 基础判定 ------------------------------------------------------------------------

test('MEMBER_MARKER_TEXT 常量为 MEMBER:', () => {
  assert.equal(MEMBER_MARKER_TEXT, 'MEMBER:')
})

test('无标记 → 全公开,memberBlocks=[], hasMemberContent=false', () => {
  const blocks = [para('a', 'A'), para('b', 'B')]
  const result = splitBlocksOnMemberMarker(blocks)
  assert.deepEqual(result, {
    publicBlocks: blocks,
    memberBlocks: [],
    hasMemberContent: false,
  })
})

test('标记在首 → publicBlocks=[], hasMemberContent=true', () => {
  const secret = para('s1', 'SECRET')
  const result = splitBlocksOnMemberMarker([marker('m1'), secret])
  assert.equal(result.hasMemberContent, true)
  assert.deepEqual(result.publicBlocks, [])
  assert.deepEqual(result.memberBlocks, [secret])
})

test('标记在中 → 前公开后会员', () => {
  const pubA = para('a', 'A')
  const pubB = para('b', 'B')
  const secret = para('s1', 'SECRET')
  const result = splitBlocksOnMemberMarker([pubA, marker('m1'), pubB, secret])
  assert.equal(result.hasMemberContent, true)
  assert.deepEqual(result.publicBlocks, [pubA])
  assert.deepEqual(result.memberBlocks, [pubB, secret])
})

test('标记在尾 → memberBlocks=[], hasMemberContent=true', () => {
  const pubA = para('a', 'A')
  const result = splitBlocksOnMemberMarker([pubA, marker('m1')])
  assert.equal(result.hasMemberContent, true)
  assert.deepEqual(result.publicBlocks, [pubA])
  assert.deepEqual(result.memberBlocks, [])
})

test('多标记 → 以第一个切分,后续标记块留在 memberBlocks', () => {
  const pubA = para('a', 'A')
  const secret = para('s1', 'SECRET')
  const result = splitBlocksOnMemberMarker([pubA, marker('m1'), secret, marker('m2')])
  assert.deepEqual(result.publicBlocks, [pubA])
  assert.deepEqual(result.memberBlocks, [secret, marker('m2')])
})

test('标记块及其 children 不入任何区', () => {
  const markerChild = para('mc', 'MARKER_CHILD')
  const markerBlock = marker('m1', [markerChild])
  const result = splitBlocksOnMemberMarker([para('a', 'A'), markerBlock, para('s', 'S')])
  const allBlocks = [...result.publicBlocks, ...result.memberBlocks]
  assert.equal(allBlocks.some((b) => b.id === 'm1'), false)
  assert.equal(allBlocks.some((b) => b.id === 'mc'), false)
})

// --- 顶层 only ----------------------------------------------------------------------

test('children 内标记不切分(顶层 only)', () => {
  const nestedMarker = marker('nested-m')
  const container = callout('c1', 'CONTAINER', [nestedMarker, para('c1-p', 'P')])
  const result = splitBlocksOnMemberMarker([para('a', 'A'), container, para('b', 'B')])
  assert.equal(result.hasMemberContent, false)
  assert.deepEqual(result.publicBlocks, [para('a', 'A'), container, para('b', 'B')])
  assert.deepEqual(result.memberBlocks, [])
})

// --- 文本规则 ------------------------------------------------------------------------

test("文本 '  MEMBER:  '(前后空白) 可识别", () => {
  const blocks = [para('a', 'A'), callout('m1', '  MEMBER:  '), para('s', 'S')]
  const result = splitBlocksOnMemberMarker(blocks)
  assert.equal(result.hasMemberContent, true)
  assert.deepEqual(result.publicBlocks, [para('a', 'A')])
})

test('多段 rich_text 拼接后为 MEMBER: 也可识别', () => {
  const blocks = [
    para('a', 'A'),
    {
      id: 'm1',
      type: 'callout',
      callout: {
        rich_text: [
          { type: 'text', plain_text: ' MEM' },
          { type: 'text', plain_text: 'BER: ' },
        ],
      },
      children: [],
    },
    para('s', 'S'),
  ]
  const result = splitBlocksOnMemberMarker(blocks)
  assert.equal(result.hasMemberContent, true)
})

test("'MEMBER: x'(附加内容) 不识别", () => {
  const blocks = [para('a', 'A'), callout('m1', 'MEMBER: x'), para('s', 'S')]
  const result = splitBlocksOnMemberMarker(blocks)
  assert.equal(result.hasMemberContent, false)
})

test("'member:'(小写) 不识别", () => {
  const blocks = [para('a', 'A'), callout('m1', 'member:'), para('s', 'S')]
  const result = splitBlocksOnMemberMarker(blocks)
  assert.equal(result.hasMemberContent, false)
})

test("'MEMBER'(无冒号) 不识别", () => {
  const blocks = [para('a', 'A'), callout('m1', 'MEMBER'), para('s', 'S')]
  const result = splitBlocksOnMemberMarker(blocks)
  assert.equal(result.hasMemberContent, false)
})

// --- 非法输入 ------------------------------------------------------------------------

test('非法输入(非数组) → 安全返回全空三件', () => {
  assert.deepEqual(splitBlocksOnMemberMarker(undefined), {
    publicBlocks: [],
    memberBlocks: [],
    hasMemberContent: false,
  })
  assert.deepEqual(splitBlocksOnMemberMarker(null), {
    publicBlocks: [],
    memberBlocks: [],
    hasMemberContent: false,
  })
  assert.deepEqual(splitBlocksOnMemberMarker('not-array'), {
    publicBlocks: [],
    memberBlocks: [],
    hasMemberContent: false,
  })
})

test('含 null/畸形块的安全容错(不抛错)', () => {
  const result = splitBlocksOnMemberMarker([null, para('a', 'A')])
  assert.equal(result.hasMemberContent, false)
  assert.equal(result.publicBlocks.length, 2)
})
