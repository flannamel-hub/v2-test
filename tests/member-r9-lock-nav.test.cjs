/**
 * 站点会员 R9-B:锁区改版(guest 面板)+ 导航「会员」紧凑 label 最低用例集。
 * - ① 常量:MEMBER_NAV_JOIN_LABEL 逐字不动(const 未改);新增
 *   MEMBER_NAV_JOIN_LABEL_COMPACT === '会员';
 * - ② JoinButton 函数体切片:COMPACT ×4(standard×2+standard-mobile×2);
 *   裸 MEMBER_NAV_JOIN_LABEL ×2(gallery aria+文本);
 * - ③④ MemberContentGate 源文件静态复核(正向新文案/负向档位窗口与直达链零残留);
 * - ⑤ 守护断言:expired/revoked 面板、主按钮、续费链、pricing 链不动;
 * - ⑥ §11-B9 追裁:StatsWidget 公告卡红钮 label 改用 COMPACT(「会员」),
 *   登录白钮/gallery/tweet/其余零改动。
 * gate 侧为纯静态 fs.readFileSync 断言(不 require MemberContentGate,
 * 规避 BlockRender→notion 重链;§11-B6⑤)。
 * 公开仓红线:用例内不出现真实域名/密钥。
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

const memberNav = require('../src/components/member/MemberNav.tsx')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']
delete require.extensions['.tsx']

const gateSrc = fs.readFileSync(
  path.join(repoRoot, 'src/components/post/MemberContentGate.tsx'),
  'utf8'
)
const navSrc = fs.readFileSync(
  path.join(repoRoot, 'src/components/member/MemberNav.tsx'),
  'utf8'
)
const statsSrc = fs.readFileSync(
  path.join(repoRoot, 'src/components/widget/StatsWidget.tsx'),
  'utf8'
)

test('R9-6 常量:MEMBER_NAV_JOIN_LABEL 逐字不动;COMPACT === 会员', () => {
  assert.equal(memberNav.MEMBER_NAV_JOIN_LABEL, '加入会员')
  assert.equal(memberNav.MEMBER_NAV_JOIN_LABEL_COMPACT, '会员')
})

test('R9-6 JoinButton 切片:COMPACT×4(standard×2+standard-mobile×2);裸 MEMBER_NAV_JOIN_LABEL×2(gallery)', () => {
  const start = navSrc.indexOf('function JoinButton')
  const end = navSrc.indexOf('/** 登录小字按钮')
  // B5 防御:未来重命名致 indexOf=-1 时勿静默放大切片
  assert.ok(start >= 0 && end > start)
  const joinButtonSrc = navSrc.slice(start, end)
  assert.equal(
    (joinButtonSrc.match(/MEMBER_NAV_JOIN_LABEL_COMPACT/g) || []).length,
    4
  )
  assert.equal(
    (joinButtonSrc.match(/MEMBER_NAV_JOIN_LABEL(?!_)/g) || []).length,
    2
  )
})

test('R9-5 gate 源文件正向:皇冠标题/中心提示/登录链接', () => {
  assert.ok(gateSrc.includes('已隐藏，请登录后查看'))
  assert.ok(gateSrc.includes('已有会员？立即登录→'))
  assert.ok(gateSrc.includes('CrownIcon'))
  assert.ok(gateSrc.includes('text-[#FACC15]'))
  assert.ok(gateSrc.includes('font-bold'))
})

test('R9-5 gate 源文件负向:档位窗口/订阅直达链零残留', () => {
  assert.equal(gateSrc.includes('已有会员码？登录'), false)
  assert.equal(gateSrc.includes('formatMembershipTierLabel'), false)
  assert.equal(gateSrc.includes('resolveStoreUrl'), false)
  assert.equal(gateSrc.includes('storeUrl'), false)
  assert.equal(gateSrc.includes('?go=1'), false)
})

test('守护:expired/revoked 面板与主按钮/pricing 链不动', () => {
  assert.ok(gateSrc.includes('会员已到期'))
  assert.ok(gateSrc.includes('该会员已被停用'))
  assert.ok(gateSrc.includes('立即续费'))
  assert.ok(gateSrc.includes('加入会员'))
  assert.ok(gateSrc.includes('href="/pricing"'))
})

test('R9-6 §11-B9:StatsWidget 红钮 label 用 COMPACT(会员);旧裸常量消费零残留', () => {
  assert.equal(statsSrc.includes('MEMBER_NAV_JOIN_LABEL_COMPACT'), true)
  assert.equal(statsSrc.includes('{MEMBER_NAV_JOIN_LABEL}'), false)
})
