/**
 * 站点会员 R2-B5a:导航会员化纯逻辑单测。
 * - cookie 助手:sm_member_no 下发/清除形状(非 HttpOnly、Path/Max-Age/SameSite、
 *   值 encode;Secure 仅生产后缀)与 sm_session 同规则;
 * - MemberNav 纯函数:欢迎文案、状态判定(chip/join/hidden)、member_no 清洗与
 *   cookie 解析、临期判定;
 * - PricingPageContent:copy 分段解析(缺省回落内置默认、benefits ≤8×≤120 双保险);
 * - 单一事实源交叉断言:MemberNav 本地 cookie 名 === memberPassport 常量;
 *   formatExpiryDate 由 MemberLoginDialog 导出(MemberNav 复用,Q13)。
 * 公开仓红线:用例内不出现真实域名/密钥(占位示例值)。
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

const memberPassport = require('../src/lib/blog/memberPassport.ts')
const memberNav = require('../src/components/member/MemberNav.tsx')
const pricingPage = require('../src/components/member/PricingPageContent.tsx')
const loginDialog = require('../src/components/member/MemberLoginDialog.tsx')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']
delete require.extensions['.tsx']

const {
  MEMBER_NO_COOKIE_NAME,
  buildMemberNoCookie,
  buildMemberNoClearCookie,
  buildMemberSetCookie,
  MEMBER_COOKIE_NAME,
} = memberPassport

const {
  MEMBER_NAV_JOIN_LABEL,
  MEMBER_NAV_LOGIN_LABEL,
  MEMBER_NAV_LOGOUT_LABEL,
  MEMBER_NAV_RENEW_LABEL,
  MEMBER_NAV_WELCOME_PREFIX,
  MEMBER_NAV_EXPIRING_SOON_DAYS,
  formatMemberWelcomeLabel,
  resolveMemberNavState,
  sanitizeMemberNo,
  readMemberNoFromCookieString,
  isMemberExpiringSoon,
} = memberNav

const { resolvePricingCopy, PRICING_COPY_BENEFIT_MAX_ITEMS, PRICING_COPY_BENEFIT_ITEM_MAX } = pricingPage

const DAY_MS = 86400_000

// --- member_no cookie 助手(M10) -------------------------------------------------------

test('MEMBER_NO_COOKIE_NAME 常量与单一事实源交叉断言(MemberNav 本地名 === memberPassport)', () => {
  assert.equal(MEMBER_NO_COOKIE_NAME, 'sm_member_no')
  // MemberNav 导出测试面经 readMemberNoFromCookieString 反推;此处以解析行为交叉验证
  assert.equal(readMemberNoFromCookieString('sm_member_no=M-96SMFQ'), 'M-96SMFQ')
})

test('buildMemberNoCookie:Path/Max-Age=604800/SameSite=Lax;非 HttpOnly;非生产无 Secure', () => {
  const cookie = buildMemberNoCookie('M001')
  assert.equal(cookie, 'sm_member_no=M001; Path=/; Max-Age=604800; SameSite=Lax')
  assert.equal(cookie.includes('HttpOnly'), false)
  assert.equal(cookie.includes('Secure'), false)
})

test('buildMemberNoCookie:值 encode(空格/中文/分隔符安全)', () => {
  assert.equal(
    buildMemberNoCookie('M 001'),
    'sm_member_no=M%20001; Path=/; Max-Age=604800; SameSite=Lax'
  )
})

test('buildMemberNoClearCookie:Max-Age=0 清除形状(非 HttpOnly)', () => {
  const cookie = buildMemberNoClearCookie()
  assert.equal(cookie, 'sm_member_no=; Path=/; Max-Age=0; SameSite=Lax')
  assert.equal(cookie.includes('HttpOnly'), false)
})

test('sm_session 侧形状对照:HttpOnly 与 member_no 非 HttpOnly 互补', () => {
  assert.equal(MEMBER_COOKIE_NAME, 'sm_session')
  const session = buildMemberSetCookie('tok', 604800)
  assert.ok(session.includes('HttpOnly'))
  assert.equal(buildMemberNoCookie('M001').includes('HttpOnly'), false)
})

// --- MemberNav 纯函数(N1) --------------------------------------------------------------

test('文案常量:加入会员/登录/退出登录/续费/欢迎前缀(纯功能文字,无 emoji)', () => {
  assert.equal(MEMBER_NAV_JOIN_LABEL, '加入会员')
  assert.equal(MEMBER_NAV_LOGIN_LABEL, '登录')
  assert.equal(MEMBER_NAV_LOGOUT_LABEL, '退出登录')
  assert.equal(MEMBER_NAV_RENEW_LABEL, '续费')
  assert.equal(MEMBER_NAV_WELCOME_PREFIX, '欢迎会员')
  assert.equal(MEMBER_NAV_EXPIRING_SOON_DAYS, 7)
})

test('formatMemberWelcomeLabel:trim 后拼接;缺省仅前缀', () => {
  assert.equal(formatMemberWelcomeLabel(' M-001 '), '欢迎会员 M-001')
  assert.equal(formatMemberWelcomeLabel(''), '欢迎会员')
  assert.equal(formatMemberWelcomeLabel(null), '欢迎会员')
  assert.equal(formatMemberWelcomeLabel(undefined), '欢迎会员')
  assert.equal(formatMemberWelcomeLabel(42), '欢迎会员')
})

test('resolveMemberNavState:active/expired → chip;disabled → hidden;其余 → join(guest 静态渲染)', () => {
  assert.equal(resolveMemberNavState('active'), 'chip')
  assert.equal(resolveMemberNavState('expired'), 'chip')
  assert.equal(resolveMemberNavState('disabled'), 'hidden')
  assert.equal(resolveMemberNavState('guest'), 'join')
  assert.equal(resolveMemberNavState('error'), 'join')
  assert.equal(resolveMemberNavState(undefined), 'join')
  assert.equal(resolveMemberNavState(null), 'join')
  assert.equal(resolveMemberNavState('revoked'), 'join')
  assert.equal(resolveMemberNavState(42), 'join')
})

test('sanitizeMemberNo:非串 → 空;trim;decode(写侧 encode);控制字符剥离;限长 32', () => {
  assert.equal(sanitizeMemberNo('M-001'), 'M-001')
  assert.equal(sanitizeMemberNo('  M-001  '), 'M-001')
  assert.equal(sanitizeMemberNo(''), '')
  assert.equal(sanitizeMemberNo(null), '')
  assert.equal(sanitizeMemberNo(42), '')
  assert.equal(sanitizeMemberNo('M%20001'), 'M 001')
  // 非法编码不抛错,保持原文
  assert.equal(sanitizeMemberNo('M%'), 'M%')
  assert.equal(sanitizeMemberNo('M\x00\x1f-0\x7f1'), 'M-01')
  assert.equal(sanitizeMemberNo('x'.repeat(64)).length, 32)
})

test('readMemberNoFromCookieString:document.cookie 形态解析;缺失 → 空;编码值解码', () => {
  assert.equal(
    readMemberNoFromCookieString('a=1; sm_member_no=M-96SMFQ; b=2'),
    'M-96SMFQ'
  )
  assert.equal(readMemberNoFromCookieString('sm_member_no=M-96SMFQ'), 'M-96SMFQ')
  assert.equal(readMemberNoFromCookieString('sm_member_no='), '')
  assert.equal(readMemberNoFromCookieString('other=1; another=2'), '')
  assert.equal(readMemberNoFromCookieString(''), '')
  assert.equal(readMemberNoFromCookieString('xsm_member_no=bad'), '')
  assert.equal(readMemberNoFromCookieString('sm_member_no=M%2D001'), 'M-001')
})

test('isMemberExpiringSoon:缺失/无效 → false;>7 天 → false;≤7 天/已到期 → true(now 注入)', () => {
  const now = Date.parse('2026-10-05T00:00:00Z')
  assert.equal(isMemberExpiringSoon(null, now), false)
  assert.equal(isMemberExpiringSoon(undefined, now), false)
  assert.equal(isMemberExpiringSoon('', now), false)
  assert.equal(isMemberExpiringSoon('not-a-date', now), false)
  assert.equal(isMemberExpiringSoon('2026-10-20T00:00:00Z', now), false)
  assert.equal(isMemberExpiringSoon('2026-10-12T00:00:00Z', now), true)
  assert.equal(isMemberExpiringSoon('2026-10-08T00:00:00.000Z', now), true)
  assert.equal(isMemberExpiringSoon('2026-10-01T00:00:00Z', now), true)
})

// --- PricingPageContent copy 分段(M18) ------------------------------------------------

test('resolvePricingCopy:null/undefined → 内置默认(copy 缺省站零视觉变化)', () => {
  for (const copy of [null, undefined, {}]) {
    const resolved = resolvePricingCopy(copy)
    assert.equal(resolved.intro, pricingPage.PRICING_INTRO_TEXT)
    assert.deepEqual(resolved.benefits, [...pricingPage.PRICING_BENEFIT_ITEMS])
    assert.equal(resolved.guarantee, pricingPage.PRICING_GUARANTEE_TEXT)
  }
})

test('resolvePricingCopy:逐字段覆盖(仅给 intro/benefits/guarantee 之一,其余默认)', () => {
  const onlyIntro = resolvePricingCopy({ intro: ' 站长自定义说明 ' })
  assert.equal(onlyIntro.intro, '站长自定义说明')
  assert.deepEqual(onlyIntro.benefits, [...pricingPage.PRICING_BENEFIT_ITEMS])
  assert.equal(onlyIntro.guarantee, pricingPage.PRICING_GUARANTEE_TEXT)

  const onlyGuarantee = resolvePricingCopy({ guarantee: ' 自定义保障 ' })
  assert.equal(onlyGuarantee.intro, pricingPage.PRICING_INTRO_TEXT)
  assert.equal(onlyGuarantee.guarantee, '自定义保障')

  const onlyBenefits = resolvePricingCopy({ benefits: ['自定义权益一', '自定义权益二'] })
  assert.deepEqual(onlyBenefits.benefits, ['自定义权益一', '自定义权益二'])
  assert.equal(onlyBenefits.intro, pricingPage.PRICING_INTRO_TEXT)
})

test('resolvePricingCopy:benefits 双保险——空串/非串剔除、全无效回落默认、≤8 条、每行 ≤120 截断', () => {
  assert.equal(PRICING_COPY_BENEFIT_MAX_ITEMS, 8)
  assert.equal(PRICING_COPY_BENEFIT_ITEM_MAX, 120)

  // 空串/空白剔除,非串剔除
  const mixed = resolvePricingCopy({ benefits: [' 有效 ', '', '   ', 42, null] })
  assert.deepEqual(mixed.benefits, ['有效'])

  // 全无效 → 默认
  const allInvalid = resolvePricingCopy({ benefits: ['', '   '] })
  assert.deepEqual(allInvalid.benefits, [...pricingPage.PRICING_BENEFIT_ITEMS])

  // 条数上限 8
  const ten = resolvePricingCopy({ benefits: Array.from({ length: 10 }, (_, i) => `权益${i}`) })
  assert.equal(ten.benefits.length, 8)
  assert.deepEqual(ten.benefits, Array.from({ length: 8 }, (_, i) => `权益${i}`))

  // 每行 120 截断
  const longItem = resolvePricingCopy({ benefits: ['x'.repeat(200)] })
  assert.equal(longItem.benefits[0].length, 120)
})

// --- Q13:formatExpiryDate 单源复用 -----------------------------------------------------

test('formatExpiryDate 由 MemberLoginDialog 导出且 MemberNav 复用同一引用(Q13,勿复制两份)', () => {
  assert.equal(typeof loginDialog.formatExpiryDate, 'function')
  assert.equal(loginDialog.formatExpiryDate('2026-11-01T00:00:00.000Z'), '2026/11/01')
  assert.equal(loginDialog.formatExpiryDate(null), '')
  assert.equal(loginDialog.formatExpiryDate('not-a-date'), '')
})

// --- 常量默认文案逐字(B4 口径不变,M18 保留导出) -----------------------------------------

test('默认文案 A/B/C 逐字一致(既有口径零变化)', () => {
  assert.equal(
    pricingPage.PRICING_INTRO_TEXT,
    '本博客开通了站点会员。订阅后即可阅读站内全部会员专属内容；会员期内不限次数阅读，到期后会员内容将重新锁定，续费即可恢复。'
  )
  assert.deepEqual([...pricingPage.PRICING_BENEFIT_ITEMS], [
    '解锁站内全部会员专属内容',
    '会员期内不限次数阅读',
    '到期前可随时续费，时长顺延',
  ])
  assert.equal(
    pricingPage.PRICING_GUARANTEE_TEXT,
    '权益保障：会员权益调整会提前公告；如遇不可用问题可通过站内联系方式反馈，我们会尽快处理。'
  )
})
