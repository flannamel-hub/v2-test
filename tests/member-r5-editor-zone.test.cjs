/** 站点会员 R5-C:会员区固定尾区+纯文本输入区 单测（批C §C7）。
 * - 转换判据矩阵（text 全块=true；image/lock/bold/italic/color/locked/第二 marker 等=false；空区=true）
 * - join/split 往返（空行分段、段内单换行保留、首尾空行、纯空文本）
 * - flush 数组形态（marker 之前原样保留、之后只余 text 块；无 marker 原样返回）
 * - 静态复核：AdminDashboard.js 关键文案/类名存在；post.js 读写协议段零改动（grep 关键行）
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
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

const {
  isMemberZoneTextConvertible,
  memberZoneTextFromBlocks,
  memberBlocksFromText,
  flushMemberZoneBlocks,
  memberZoneParagraphCount,
} = require('../src/lib/admin/memberZoneText.js')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader

const textBlock = (content = '', extra = {}) => ({ id: content, type: 'text', content, ...extra })

// === 1. 转换判据矩阵（C3-1） ===

test('判据:区段全为纯 text 块 → 可转换(true)', () => {
  const blocks = [textBlock('导语'), { type: 'member' }, textBlock('A'), textBlock('B')]
  assert.equal(isMemberZoneTextConvertible(blocks, 1), true)
})

test('判据:空区(marker 为末块) → 可转换(true)', () => {
  const blocks = [textBlock('导语'), { type: 'member' }]
  assert.equal(isMemberZoneTextConvertible(blocks, 1), true)
})

test('判据:无 marker(-1) → false', () => {
  assert.equal(isMemberZoneTextConvertible([textBlock('A')], -1), false)
  assert.equal(isMemberZoneTextConvertible([], -1), false)
})

test('判据:区段含 image/lock/h1/quote/ol/toggle/link → false', () => {
  for (const t of ['image', 'lock', 'h1', 'quote', 'ol', 'ul', 'todo', 'toggle', 'link', 'note']) {
    const blocks = [{ type: 'member' }, { type: t, content: 'x' }]
    assert.equal(isMemberZoneTextConvertible(blocks, 0), false, `type=${t} 应回退`)
  }
})

test('判据:区段含第二条 member marker → false', () => {
  const blocks = [{ type: 'member' }, textBlock('A'), { type: 'member' }]
  assert.equal(isMemberZoneTextConvertible(blocks, 0), false)
})

test('判据:text 带格式修饰(bold/italic/非 default color) → false', () => {
  assert.equal(isMemberZoneTextConvertible([{ type: 'member' }, textBlock('A', { bold: true })], 0), false)
  assert.equal(isMemberZoneTextConvertible([{ type: 'member' }, textBlock('A', { italic: true })], 0), false)
  assert.equal(isMemberZoneTextConvertible([{ type: 'member' }, textBlock('A', { color: 'red' })], 0), false)
  // color:'default' 或缺省 → 不触发回退
  assert.equal(isMemberZoneTextConvertible([{ type: 'member' }, textBlock('A', { color: 'default' })], 0), true)
  assert.equal(isMemberZoneTextConvertible([{ type: 'member' }, textBlock('A')], 0), true)
})

test('判据:text 加密(locked=true 或专用 lock) → false(LOCK 外壳会改变序列化形态)', () => {
  assert.equal(isMemberZoneTextConvertible([{ type: 'member' }, textBlock('A', { locked: true })], 0), false)
  assert.equal(isMemberZoneTextConvertible([{ type: 'member' }, { type: 'lock', pwd: '1' }], 0), false)
})

test('判据:text 的 images/checked/isCover 字段对判据无意义(不触发回退)', () => {
  const b = textBlock('A', { images: [], checked: [], isCover: false })
  assert.equal(isMemberZoneTextConvertible([{ type: 'member' }, b], 0), true)
})

// === 2. join/split 往返（C3-3） ===

test('join:各 text 块 content 以空行连接;空内容块跳过;非 text 块跳过(回退模式死状态防御)', () => {
  assert.equal(memberZoneTextFromBlocks([textBlock('A'), textBlock('B')]), 'A\n\nB')
  assert.equal(memberZoneTextFromBlocks([textBlock('A'), textBlock(''), textBlock('B')]), 'A\n\nB')
  assert.equal(memberZoneTextFromBlocks([]), '')
  assert.equal(memberZoneTextFromBlocks(null), '')
  // 防御:非 text 块不并入文本(该函数只在可转换区段被真正消费)
  assert.equal(memberZoneTextFromBlocks([textBlock('A'), { type: 'image', content: 'https://x' }]), 'A')
})

test('split:空行分段;每段为全新 text 块(带 createEditorBlock 全量字段)', () => {
  const out = memberBlocksFromText('A\n\nB\n\nC')
  assert.equal(out.length, 3)
  out.forEach((b) => {
    assert.equal(b.type, 'text')
    assert.equal(typeof b.id, 'number')
    assert.equal(b.bold, false)
    assert.equal(b.italic, false)
    assert.equal(b.color, 'default')
    assert.equal(b.locked, false)
  })
  assert.deepEqual(out.map((b) => b.content), ['A', 'B', 'C'])
})

test('split:段内单换行逐字保留在 content 内(沿用现 text 块序列化口径)', () => {
  const out = memberBlocksFromText('A\nB')
  assert.equal(out.length, 1)
  assert.equal(out[0].content, 'A\nB')
})

test('split:首尾空行/多连续空行/纯空白段归一;纯空文本 → 空数组', () => {
  assert.deepEqual(memberBlocksFromText('\n\nA\n\n\n').map((b) => b.content), ['A'])
  assert.deepEqual(memberBlocksFromText('A\n\n \n\nB').map((b) => b.content), ['A', 'B'])
  assert.deepEqual(memberBlocksFromText(''), [])
  assert.deepEqual(memberBlocksFromText(null), [])
  assert.deepEqual(memberBlocksFromText('\n\n  \n\n'), [])
})

test('往返:join→split 稳定(空行分段形态逐字还原)', () => {
  const text = '第一段\n\n第二段\n行2\n\n第三段'
  const once = memberZoneTextFromBlocks(memberBlocksFromText(text))
  assert.equal(once, text)
  const twice = memberZoneTextFromBlocks(memberBlocksFromText(once))
  assert.equal(twice, text)
})

test('计数:memberZoneParagraphCount 非空段数', () => {
  assert.equal(memberZoneParagraphCount('A\n\nB'), 2)
  assert.equal(memberZoneParagraphCount('A\nB'), 1)
  assert.equal(memberZoneParagraphCount(''), 0)
  assert.equal(memberZoneParagraphCount('\n\n \n'), 0)
  assert.equal(memberZoneParagraphCount('A\n\n\n\nB'), 2)
})

// === 3. flush 数组形态（C3-3/C5） ===

test('flush:marker 及其之前原样保留(引用相等),之后只余纯 text 块', () => {
  const pub1 = textBlock('导语')
  const marker = { type: 'member' }
  const blocks = [pub1, marker, textBlock('旧段'), { type: 'image', content: 'https://old' }]
  const out = flushMemberZoneBlocks(blocks, '新A\n\n新B')
  assert.equal(out.length, 4)
  assert.equal(out[0], pub1)
  assert.equal(out[1], marker)
  assert.deepEqual(out.slice(2).map((b) => b.type), ['text', 'text'])
  assert.deepEqual(out.slice(2).map((b) => b.content), ['新A', '新B'])
})

test('flush:空文本 → marker 独占(前台空链路:memberBlocks=[] 零输出)', () => {
  const marker = { type: 'member' }
  const out = flushMemberZoneBlocks([textBlock('A'), marker, textBlock('旧')], '')
  assert.deepEqual(out, [out[0], marker])
  assert.equal(out.length, 2)
})

test('flush:无 marker → 原样返回(同引用)', () => {
  const blocks = [textBlock('A'), textBlock('B')]
  assert.equal(flushMemberZoneBlocks(blocks, 'X'), blocks)
  assert.equal(flushMemberZoneBlocks(null, 'X'), null)
})

// === 4. 静态复核（C7） ===

const dashPath = path.join(repoRoot, 'src/components/blog-manager/AdminDashboard.js')
const dashSrc = fs.readFileSync(dashPath, 'utf8')
const postPath = path.join(repoRoot, 'src/pages/api/admin/post.js')
const postSrc = fs.readFileSync(postPath, 'utf8')

test('静态:AdminDashboard.js 含 R5-C 关键文案/锚点(入口按钮/toast/输入区/回退提示)', () => {
  assert.ok(dashSrc.includes('添加会员区内容'), '入口按钮文案')
  assert.ok(dashSrc.includes('已存在会员内容区：点击定位'), '提示行-已存在')
  assert.ok(dashSrc.includes('点击展开会员内容输入区；内容仅登录会员可见，自动显示在正文底部'), '提示行-未存在')
  assert.ok(dashSrc.includes('在此输入会员专属内容…（仅登录会员可见）'), 'placeholder')
  assert.ok(dashSrc.includes('输入完成后点击左侧保存按钮即可；空白行分段'), '输入区提示行')
  assert.ok(dashSrc.includes('当前会员区包含历史媒体或格式内容，暂以原块模式编辑；清理为纯文本后可切换文本输入区'), '回退提示')
  assert.ok(dashSrc.includes('会员内容区固定在正文底部，不可移出'), 'toast-公开块下移')
  assert.ok(dashSrc.includes('会员区内容不可移到正文'), 'toast-会员块上移')
  assert.ok(dashSrc.includes('会员内容区不可删除'), 'toast-删 marker')
})

test('静态:AdminDashboard.js 含 member-zone-textarea / member-zone-input / 旧金冠入口已删', () => {
  assert.ok(dashSrc.includes('member-zone-textarea'), '输入区样式类')
  assert.ok(dashSrc.includes('id="member-zone-input"'), '固定 id(跨视图聚焦锚)')
  assert.ok(!dashSrc.includes('会员专属内容\n'), '旧入口按钮文案「会员专属内容」不应残留为按钮文字')
})

test('静态:post.js 写侧协议零改动(makeMemberCallout/structuredToBlocks member 段关键行)', () => {
  assert.ok(postSrc.includes('rich_text: [{ text: { content: MEMBER_MARKER_TEXT } }],'), 'makeMemberCallout 标准形态(单段 MEMBER: 纯文本)')
  assert.ok(postSrc.includes("icon: { type: 'emoji', emoji: '🔒' },\r\n      color: 'gray_background',"), 'makeMemberCallout 外壳(灰底锁图标)')
  assert.ok(postSrc.includes("if (b.type === 'member') {"), 'structuredToBlocks member 分支')
  assert.ok(postSrc.includes('if (!memberEmitted) { out.push(makeMemberCallout()); memberEmitted = true; }'), '仅保留第一条(收敛)')
})

test('静态:post.js 读侧协议零改动(MEMBER_MARKER_TEXT → member 块还原)', () => {
  assert.ok(postSrc.includes("} else if (txt.trim() === MEMBER_MARKER_TEXT) {"), '读侧判据')
  assert.ok(postSrc.includes('out.push({ type: \'member\' });'), '读侧还原 member 块')
})
