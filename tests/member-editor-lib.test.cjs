/** 站点会员 B3:contentMediaFlush.js 的 member 块行为单测(§9.1)。
 * - serializeBlocksForSave:member 块字段白名单透传(type 保留,content 空串);
 * - blocksToMarkdown:member 导出 :::member、多条收敛仅一条、头块为 member 时开头即标记;
 *   无 member 时输出与旧行为一致(回归)。 */
const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { test } = require('node:test')
const babel = require('@babel/core')

const repoRoot = path.resolve(__dirname, '..')
const srcRoot = `${path.join(repoRoot, 'src')}${path.sep}`
const originalResolveFilename = Module._resolveFilename
const originalJsLoader = require.extensions['.js']

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

const { serializeBlocksForSave, blocksToMarkdown } = require('../src/lib/admin/contentMediaFlush.js')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader

const memberBlock = (extra = {}) => ({ id: 'm1', type: 'member', ...extra })

test('serializeBlocksForSave:member 块透传,type 保留、字段完整(content 空串)', () => {
  const saved = serializeBlocksForSave([memberBlock(), { id: 't1', type: 'text', content: 'A' }])
  assert.equal(saved.length, 2)
  const m = saved[0]
  assert.equal(m.type, 'member')
  assert.equal(m.content, '')
  assert.equal(m.locked, false)
  assert.equal(m.url, '')
  assert.deepEqual(m.images, [])
  assert.equal(m.isCover, false)
})

test('blocksToMarkdown:[text, member, text] → 含 \\n\\n:::member\\n\\n', () => {
  const md = blocksToMarkdown([
    { id: 't1', type: 'text', content: '公开段落' },
    memberBlock(),
    { id: 't2', type: 'text', content: '会员段落' },
  ])
  assert.equal(md, '公开段落\n\n:::member\n\n会员段落')
})

test('blocksToMarkdown:[member, member] → 仅 1 个 :::member(收敛)', () => {
  const md = blocksToMarkdown([memberBlock({ id: 'm1' }), memberBlock({ id: 'm2' })])
  assert.equal((md.match(/:::member/g) || []).length, 1)
  assert.equal(md, ':::member')
})

test('blocksToMarkdown:[member, text] → 开头即 marker', () => {
  const md = blocksToMarkdown([memberBlock(), { id: 't1', type: 'text', content: 'A' }])
  assert.ok(md.startsWith(':::member'))
  assert.equal(md, ':::member\n\nA')
})

test('blocksToMarkdown:无 member → 与旧行为一致(回归)', () => {
  const md = blocksToMarkdown([
    { id: 't1', type: 'text', content: 'x' },
    { id: 'h1', type: 'h1', content: '标题' },
    { id: 'q1', type: 'quote', content: '引用行' },
    { id: 'i1', type: 'image', content: 'https://img.example.com/a.png' },
    { id: 'img-empty', type: 'image', content: '' },
  ])
  assert.equal(md, 'x\n\n# 标题\n\n> 引用行\n\n![](https://img.example.com/a.png)')
  assert.equal(md.includes(':::member'), false)
})
