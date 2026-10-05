/**
 * 站点会员 B4:MemberCenter / PricingPageContent / MemberLoginDialog 纯逻辑与文案单测。
 * - 状态映射:session status → 会员中心视图;
 * - 日期格式:ISO → YYYY/MM/DD(无效容错);
 * - 文案选择:小字脚注 / 续费错误行内文案(按 body.error,status 仅兜底)/ 登录错误映射 / QR 错误;
 * - 定价页文案 A/B/C 与 /member guest 说明段同源。
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

// React 组件文件按 JSX 转译(babel preset 无 JSX;组件内含 tsx 语法)
require.extensions['.tsx'] = function transpileProjectTsx(module, filename) {
  const result = babel.transformFileSync(filename, {
    babelrc: false,
    configFile: false,
    presets: [
      [
        require.resolve('@babel/preset-typescript'),
        { isTSX: true, allExtensions: true },
      ],
      [
        require.resolve('@babel/preset-react'),
        { runtime: 'classic' },
      ],
      [
        require.resolve('@babel/preset-env'),
        { targets: { node: 'current' }, modules: 'commonjs' },
      ],
    ],
  })
  return module._compile(result.code, filename)
}

const memberCenter = require('../src/components/member/MemberCenter.tsx')
const pricingPage = require('../src/components/member/PricingPageContent.tsx')
const loginDialog = require('../src/components/member/MemberLoginDialog.tsx')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']
delete require.extensions['.tsx']

const {
  resolveMemberCenterView,
  formatMemberExpiryDate,
  resolveMemberRenewErrorText,
  MEMBER_PRICING_INTRO_TEXT,
  MEMBER_CENTER_FOOTNOTE,
  MEMBER_RENEW_ERROR_TEXT,
} = memberCenter

// --- 状态映射 -------------------------------------------------------------------------

test('resolveMemberCenterView:active/expired 直接映射;其余一律 guest(fail-closed)', () => {
  assert.equal(resolveMemberCenterView('active'), 'active')
  assert.equal(resolveMemberCenterView('expired'), 'expired')
  assert.equal(resolveMemberCenterView('guest'), 'guest')
  assert.equal(resolveMemberCenterView('disabled'), 'guest')
  assert.equal(resolveMemberCenterView('revoked'), 'guest')
  assert.equal(resolveMemberCenterView(undefined), 'guest')
  assert.equal(resolveMemberCenterView(null), 'guest')
  assert.equal(resolveMemberCenterView(42), 'guest')
})

// --- 日期格式 -------------------------------------------------------------------------

test('formatMemberExpiryDate:ISO → YYYY/MM/DD;无效/缺失 → 空串', () => {
  assert.equal(formatMemberExpiryDate('2026-11-01T00:00:00.000Z'), '2026/11/01')
  assert.equal(formatMemberExpiryDate('2026-02-09T15:30:00.000Z'), '2026/02/09')
  assert.equal(formatMemberExpiryDate(''), '')
  assert.equal(formatMemberExpiryDate(null), '')
  assert.equal(formatMemberExpiryDate(undefined), '')
  assert.equal(formatMemberExpiryDate('not-a-date'), '')
  assert.equal(formatMemberExpiryDate(12345), '')
})

// --- 续费错误文案(按 body.error;status 仅兜底) ---------------------------------------

test('resolveMemberRenewErrorText:guest/invalid/401 → 请先登录;其余 → 暂时不可用', () => {
  assert.equal(resolveMemberRenewErrorText(401, { error: 'guest' }), MEMBER_RENEW_ERROR_TEXT.guest)
  assert.equal(resolveMemberRenewErrorText(401, null), MEMBER_RENEW_ERROR_TEXT.guest)
  assert.equal(resolveMemberRenewErrorText(500, { error: 'invalid' }), MEMBER_RENEW_ERROR_TEXT.guest)
  assert.equal(resolveMemberRenewErrorText(503, { error: 'unavailable' }), MEMBER_RENEW_ERROR_TEXT.unavailable)
  assert.equal(resolveMemberRenewErrorText(429, { error: 'rate_limited' }), MEMBER_RENEW_ERROR_TEXT.unavailable)
  assert.equal(resolveMemberRenewErrorText(500, null), MEMBER_RENEW_ERROR_TEXT.unavailable)
})

test('MEMBER_RENEW_ERROR_TEXT:文案与派工单 §7 逐字一致', () => {
  assert.equal(MEMBER_RENEW_ERROR_TEXT.guest, '请先登录')
  assert.equal(MEMBER_RENEW_ERROR_TEXT.unavailable, '暂时不可用，请稍后重试')
})

// --- 小字脚注 -------------------------------------------------------------------------

test('MEMBER_CENTER_FOOTNOTE:active/expired 小字文案逐字一致', () => {
  assert.equal(MEMBER_CENTER_FOOTNOTE.active, '会员状态以最近一次核验为准（变更 ≤24 小时生效）')
  assert.equal(MEMBER_CENTER_FOOTNOTE.expired, '续费完成后回到本站刷新即可恢复访问')
})

// --- 文案 A 同源 ----------------------------------------------------------------------

test('文案 A:MEMBER_PRICING_INTRO_TEXT 与 PRICING_INTRO_TEXT 同文(§7 单一事实源)', () => {
  assert.equal(MEMBER_PRICING_INTRO_TEXT, pricingPage.PRICING_INTRO_TEXT)
  assert.equal(
    MEMBER_PRICING_INTRO_TEXT,
    '本博客开通了站点会员。订阅后即可阅读站内全部会员专属内容；会员期内不限次数阅读，到期后会员内容将重新锁定，续费即可恢复。'
  )
})

// --- 定价页文案 B/C -------------------------------------------------------------------

test('文案 B:权益要点三条逐字一致', () => {
  assert.deepEqual([...pricingPage.PRICING_BENEFIT_ITEMS], [
    '解锁站内全部会员专属内容',
    '会员期内不限次数阅读',
    '到期前可随时续费，时长顺延',
  ])
})

test('文案 C:保障说明逐字一致', () => {
  assert.equal(
    pricingPage.PRICING_GUARANTEE_TEXT,
    '权益保障：会员权益调整会提前公告；如遇不可用问题可通过站内联系方式反馈，我们会尽快处理。'
  )
})

// --- 登录错误映射(沿用既有四类,不改字) ----------------------------------------------

test('LOGIN_ERROR_TEXT:四类文案逐字一致 + 未知错误回落 unavailable', () => {
  const map = loginDialog.LOGIN_ERROR_TEXT
  assert.equal(map.invalid, '会员码无效')
  assert.equal(map.revoked, '该会员码已停用')
  assert.equal(map.rate_limited, '尝试过于频繁，请稍后再试')
  assert.equal(map.unavailable, '暂时不可用，请稍后重试')
  assert.equal(map.unknown_error ?? map.unavailable, '暂时不可用，请稍后重试')
})

// --- QR 错误文案(Q5:bad_file 与 decode_failed 分开映射) ------------------------------

test('QR 错误文案:bad_file 与 decode_failed 独立映射', () => {
  assert.equal(loginDialog.QR_BAD_FILE_TEXT, '文件过大或格式不支持')
  assert.equal(loginDialog.QR_DECODE_FAILED_TEXT, '未识别到二维码，请重试或直接粘贴会员码')
  assert.notEqual(loginDialog.QR_BAD_FILE_TEXT, loginDialog.QR_DECODE_FAILED_TEXT)
})
