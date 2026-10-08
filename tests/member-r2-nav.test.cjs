/**
 * 站点会员 R2-B5a:导航会员化纯逻辑单测。
 * - cookie 助手:sm_member_no 下发/清除形状(非 HttpOnly、Path/Max-Age/SameSite、
 *   值 encode;Secure 仅生产后缀)与 sm_session 同规则;
 * - MemberNav 纯函数:欢迎文案、状态判定(chip/join/hidden)、member_no 清洗与
 *   cookie 解析、临期判定;
 * - PricingPageContent:copy 分段解析(缺省回落内置默认、benefits ≤8×≤120 双保险);
 * - 单一事实源交叉断言:MemberNav 本地 cookie 名 === memberPassport 常量;
 *   formatExpiryDate 由 MemberLoginDialog 导出(MemberNav 复用,Q13)。
 * - R3-B 追加:R3-6 可见性纯函数(resolveMemberNavStandardRender/
 *   resolveStatsWidgetMemberButtons)、R3-3 永久映射(isPermanentMemberExpiry 含
 *   恰等 30000 天边界、formatMemberValidityText、formatMembershipTierLabel)。
 * 公开仓红线:用例内不出现真实域名/密钥(占位示例值)。
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
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
const statsWidget = require('../src/components/widget/StatsWidget.tsx')

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

const {
  resolvePricingCopy,
  PRICING_COPY_BENEFIT_MAX_ITEMS,
  PRICING_COPY_BENEFIT_ITEM_MAX,
  PRICING_FAQ_TITLE_TEXT,
  PRICING_COPY_FAQ_MAX_ITEMS,
  PRICING_COPY_FAQ_Q_MAX,
  PRICING_COPY_FAQ_A_MAX,
  PRICING_FAQ_DEFAULT,
} = pricingPage

const {
  isPermanentMemberExpiry,
  formatMemberValidityText,
  formatMembershipTierLabel,
} = loginDialog

const { resolveMemberNavStandardRender } = memberNav
const { resolveStatsWidgetMemberButtons } = statsWidget

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
    assert.deepEqual(resolved.faq, [...PRICING_FAQ_DEFAULT])
  }
})

test('resolvePricingCopy:逐字段覆盖(仅给 intro/benefits/guarantee 之一,其余默认)', () => {
  const onlyIntro = resolvePricingCopy({ intro: ' 站长自定义说明 ' })
  assert.equal(onlyIntro.intro, '站长自定义说明')
  assert.deepEqual(onlyIntro.benefits, [...pricingPage.PRICING_BENEFIT_ITEMS])
  assert.equal(onlyIntro.guarantee, pricingPage.PRICING_GUARANTEE_TEXT)
  assert.deepEqual(onlyIntro.faq, [...PRICING_FAQ_DEFAULT])

  const onlyGuarantee = resolvePricingCopy({ guarantee: ' 自定义保障 ' })
  assert.equal(onlyGuarantee.intro, pricingPage.PRICING_INTRO_TEXT)
  assert.equal(onlyGuarantee.guarantee, '自定义保障')
  assert.deepEqual(onlyGuarantee.faq, [...PRICING_FAQ_DEFAULT])

  const onlyBenefits = resolvePricingCopy({ benefits: ['自定义权益一', '自定义权益二'] })
  assert.deepEqual(onlyBenefits.benefits, ['自定义权益一', '自定义权益二'])
  assert.equal(onlyBenefits.intro, pricingPage.PRICING_INTRO_TEXT)
  assert.deepEqual(onlyBenefits.faq, [...PRICING_FAQ_DEFAULT])
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

  // benefits 维度不触碰 faq(独立回落默认)
  assert.deepEqual(longItem.faq, [...PRICING_FAQ_DEFAULT])
})

// --- R6-6:PricingPageContent FAQ 分段 ---------------------------------------------------

test('R6 FAQ 默认 5 组逐字', () => {
  assert.equal(PRICING_FAQ_TITLE_TEXT, '常见问题')
  assert.equal(PRICING_FAQ_DEFAULT.length, 5)
  assert.deepEqual(resolvePricingCopy(null).faq, [...PRICING_FAQ_DEFAULT])
  // 定稿逐字抽查:第 4 组句末无句号、第 3 组有句号、「登录」用字
  assert.equal(resolvePricingCopy(null).faq[3].q, '会员资格可以跨设备使用吗？')
  assert.equal(resolvePricingCopy(null).faq[3].a, '可以，使用会员key或身份二维码即可登录')
  assert.equal(resolvePricingCopy(null).faq[2].a, '立即生效。')
  // 全量逐字(deepEqual 已含;再对首组标题逐字钉死引号/问号)
  assert.equal(resolvePricingCopy(null).faq[0].q, '可以使用哪些付款方式？')
})

test('R6 faq 双保险:混非法项剔除、全无效回落默认、≤8 截断、q≤80/a≤300 截断', () => {
  assert.equal(PRICING_COPY_FAQ_MAX_ITEMS, 8)
  assert.equal(PRICING_COPY_FAQ_Q_MAX, 80)
  assert.equal(PRICING_COPY_FAQ_A_MAX, 300)

  // 空q/空a/非对象/非串字段剔除,合法项保留
  const mixed = resolvePricingCopy({
    faq: [
      { q: ' 有效问题 ', a: ' 有效答案 ' },
      { q: '', a: '答案' },
      { q: '问题', a: '   ' },
      'not-an-object',
      42,
      null,
      { q: '只有q' },
      { q: '问题二', a: 42 },
    ],
  })
  assert.deepEqual(mixed.faq, [{ q: '有效问题', a: '有效答案' }])

  // 全无效 → 回落默认 5 组
  const allInvalid = resolvePricingCopy({ faq: [{ q: '', a: '' }, 'x', null] })
  assert.deepEqual(allInvalid.faq, [...PRICING_FAQ_DEFAULT])

  // ≤8 截断
  const ten = resolvePricingCopy({
    faq: Array.from({ length: 10 }, (_, i) => ({ q: `问题${i}`, a: `答案${i}` })),
  })
  assert.equal(ten.faq.length, 8)
  assert.deepEqual(ten.faq, Array.from({ length: 8 }, (_, i) => ({ q: `问题${i}`, a: `答案${i}` })))

  // q≤80、a≤300 截断
  const long = resolvePricingCopy({ faq: [{ q: 'q'.repeat(200), a: 'a'.repeat(500) }] })
  assert.equal(long.faq[0].q.length, 80)
  assert.equal(long.faq[0].a.length, 300)
})

// --- R6 源文件静态复核(§11.1-R1 定稿口径) ----------------------------------------------

test('R6 源文件静态复核:PricingPageContent !text-white×3/总 text-white×5;MemberLoginDialog 红字零残留', () => {
  const pricingSrc = fs.readFileSync(path.join(repoRoot, 'src/components/member/PricingPageContent.tsx'), 'utf8')
  assert.equal((pricingSrc.match(/!text-white/g) || []).length, 3)
  // R13:三处 CTA 的 important 白字自字面量收敛进 ctaTextCls(前缀式 important 语义不变);
  // 断言对应更新:3 处引用模板 + ctaTextCls 默认分支仍含 '!text-white'
  assert.equal((pricingSrc.match(/font-semibold \$\{ctaTextCls\} transition-all/g) || []).length, 3)
  assert.ok(pricingSrc.includes(": '!text-white'"))
  assert.equal((pricingSrc.match(/text-white/g) || []).length, 5) // 3 个 ! 版 + priceCls 两处
  // R6-5 步骤图例两节点逐字 + R6-6 FAQ 标题
  assert.ok(pricingSrc.includes('选择方案'))
  assert.ok(pricingSrc.includes('付费方式'))
  assert.ok(pricingSrc.includes('常见问题'))

  const loginSrc = fs.readFileSync(path.join(repoRoot, 'src/components/member/MemberLoginDialog.tsx'), 'utf8')
  assert.equal((loginSrc.match(/text-\[#dc2626\]/g) || []).length, 0)
  assert.equal((loginSrc.match(/hover:text-\[#b91c1c\]/g) || []).length, 0)
  assert.ok(loginSrc.includes('bg-[#dc2626]')) // 登录提交钮品牌红保留
  assert.ok(loginSrc.includes('backToLoginCls'))
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

// --- R3-6:standard 导航可见性 / 公告卡按钮决策纯函数 ------------------------------------

test('resolveMemberNavStandardRender:standard/standard-mobile 除 hidden 外一律不渲染;gallery/tweet 不受影响', () => {
  // R12-B(6A):未登录 join 与登录态 chip 一律不渲染(登录入口与会员面均在公告卡)
  assert.equal(resolveMemberNavStandardRender('standard', 'join'), false)
  assert.equal(resolveMemberNavStandardRender('standard-mobile', 'join'), false)
  // R12-B(6A):登录态 chip 亦不渲染(登出/续费移至首页与 about 公告卡信息块)
  assert.equal(resolveMemberNavStandardRender('standard', 'chip'), false)
  assert.equal(resolveMemberNavStandardRender('standard-mobile', 'chip'), false)
  // gallery/tweet 变体不受本判定约束(chip 保留,行为不变)
  assert.equal(resolveMemberNavStandardRender('gallery', 'join'), true)
  assert.equal(resolveMemberNavStandardRender('gallery', 'chip'), true)
  assert.equal(resolveMemberNavStandardRender('tweet', 'join'), true)
  assert.equal(resolveMemberNavStandardRender('tweet-mobile', 'join'), true)
  // hidden(disabled)全变体不渲染
  assert.equal(resolveMemberNavStandardRender('standard', 'hidden'), false)
  assert.equal(resolveMemberNavStandardRender('gallery', 'hidden'), false)
})

test('resolveStatsWidgetMemberButtons:guest → dual;active/expired/disabled/probing/未知 → hidden', () => {
  assert.equal(resolveStatsWidgetMemberButtons('guest'), 'dual')
  assert.equal(resolveStatsWidgetMemberButtons('active'), 'hidden')
  assert.equal(resolveStatsWidgetMemberButtons('expired'), 'hidden')
  assert.equal(resolveStatsWidgetMemberButtons('disabled'), 'hidden')
  // probing 归入 hidden:登录用户不闪现按钮(无跳动),guest 探测后浮现
  assert.equal(resolveStatsWidgetMemberButtons('probing'), 'hidden')
  assert.equal(resolveStatsWidgetMemberButtons(undefined), 'hidden')
  assert.equal(resolveStatsWidgetMemberButtons(null), 'hidden')
})

// --- R3-3:永久档显示映射 ----------------------------------------------------------------

test('isPermanentMemberExpiry:365 天否/36500 天是/恰等 30000 天否(严格>)/无效缺失否(now 注入)', () => {
  const now = Date.parse('2026-10-05T00:00:00Z')
  // 限时档(365 天内/恰好 365 天)→ false
  assert.equal(isPermanentMemberExpiry('2026-10-05T00:00:00.000Z', now), false)
  assert.equal(isPermanentMemberExpiry('2027-10-05T00:00:00.000Z', now), false)
  // 恰等 30000 天 → false(严格大于,§11.2-建议7 边界)
  assert.equal(
    isPermanentMemberExpiry(new Date(now + 30000 * DAY_MS).toISOString(), now),
    false
  )
  // 30000 天 + 1ms → true
  assert.equal(
    isPermanentMemberExpiry(new Date(now + 30000 * DAY_MS + 1).toISOString(), now),
    true
  )
  // 36500 天(永久档)→ true
  assert.equal(
    isPermanentMemberExpiry(new Date(now + 36500 * DAY_MS).toISOString(), now),
    true
  )
  // 无效/缺失 → false
  assert.equal(isPermanentMemberExpiry(null, now), false)
  assert.equal(isPermanentMemberExpiry(undefined, now), false)
  assert.equal(isPermanentMemberExpiry('', now), false)
  assert.equal(isPermanentMemberExpiry('not-a-date', now), false)
})

test('formatMemberValidityText:永久 → 永久有效;限时 → prefix+日期(默认/自定义);无效缺失 → 空串', () => {
  // 永久(固定远期日期,距测试时刻 > 30000 天)
  assert.equal(formatMemberValidityText('2126-10-05T00:00:00.000Z'), '永久有效')
  assert.equal(formatMemberValidityText('2126-10-05T00:00:00.000Z', '到期日'), '永久有效')
  // 限时(默认前缀/自定义前缀)
  assert.equal(
    formatMemberValidityText('2026-11-01T00:00:00.000Z'),
    '会员有效期至 2026/11/01'
  )
  assert.equal(
    formatMemberValidityText('2026-11-01T00:00:00.000Z', '到期日'),
    '到期日 2026/11/01'
  )
  // 无效/缺失 → ''(消费方兜底:chip「会员生效中」/条件渲染)
  assert.equal(formatMemberValidityText(null), '')
  assert.equal(formatMemberValidityText(undefined), '')
  assert.equal(formatMemberValidityText(''), '')
  assert.equal(formatMemberValidityText('not-a-date'), '')
})

test('formatMembershipTierLabel:36500 → 永久;≥36500 同;常规 → N 天', () => {
  assert.equal(formatMembershipTierLabel(36500), '永久')
  assert.equal(formatMembershipTierLabel(36501), '永久')
  assert.equal(formatMembershipTierLabel(365), '365 天')
  assert.equal(formatMembershipTierLabel(30), '30 天')
  assert.equal(formatMembershipTierLabel(7), '7 天')
  assert.equal(formatMembershipTierLabel(1), '1 天')
})
