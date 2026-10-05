/**
 * 站点会员 R4-B/R5-B:UI 常量/导出面最低用例集(派工单 §11.1-S8 定转正;R5-B 扩 2 用例)。
 * - ① INPUT_PLACEHOLDER_TEXT 逐字断言(R5-B2 文案,含「会员」字样;负向旧「会员码」与旧 R4 串);
 * - ② CrownIcon 为可导出函数(M2 改导出,供 pricing CTA/公告卡按钮复用);
 * - ③ SESSION_CACHE_TTL_MS === 60000(60s 模块级缓存 TTL);
 * - ④ R5-B2 双视图文案常量逐字(上传标题/游客继续/返回登录/上传区文案);
 * - ⑤ R5-B 源文件静态复核(弹窗 hint 已删/pricing 新文案与旧行)。
 * 交互面(开窗过渡/双视图切换/CTA 样式)由 Hermes §7 截图矩阵覆盖,EXEC_NOTES 已登记。
 * 公开仓红线:用例内不出现真实域名/密钥。
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

const loginDialog = require('../src/components/member/MemberLoginDialog.tsx')
const memberNav = require('../src/components/member/MemberNav.tsx')

Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader
if (originalTsLoader) require.extensions['.ts'] = originalTsLoader
else delete require.extensions['.ts']
delete require.extensions['.tsx']

test('INPUT_PLACEHOLDER_TEXT:逐字一致(R5-B2;含「会员」字样;负向旧「会员码」与旧 R4 串)', () => {
  assert.equal(loginDialog.INPUT_PLACEHOLDER_TEXT, '请输入会员key或上传会员身份码')
  assert.ok(loginDialog.INPUT_PLACEHOLDER_TEXT.includes('会员'))
  assert.notEqual(loginDialog.INPUT_PLACEHOLDER_TEXT, '会员码')
  assert.notEqual(loginDialog.INPUT_PLACEHOLDER_TEXT, '请输入登录key或上传身份码')
})

test('CrownIcon:为可导出函数(M2 改导出;R5-B1 改实心,供 pricing CTA/公告卡复用)', () => {
  assert.equal(typeof memberNav.CrownIcon, 'function')
})

test('SESSION_CACHE_TTL_MS === 60000(R4-B1 模块级探测缓存 60s TTL)', () => {
  assert.equal(loginDialog.SESSION_CACHE_TTL_MS, 60000)
})

test('R5 双视图文案常量:逐字一致', () => {
  assert.equal(loginDialog.UPLOAD_VIEW_TITLE_TEXT, '使用登录码登录')
  assert.equal(loginDialog.GUEST_CONTINUE_TEXT, '以游客模式继续 →')
  assert.equal(loginDialog.BACK_TO_LOGIN_TEXT, '返回登录')
  assert.equal(loginDialog.QR_DROPZONE_TEXT, '拖拽或点击上传登录码')
})

test('R5 源文件静态复核:弹窗 hint 已删 / pricing 新文案与旧行', () => {
  const fs = require('node:fs')
  const dialogSrc = fs.readFileSync(path.join(repoRoot, 'src/components/member/MemberLoginDialog.tsx'), 'utf8')
  assert.equal(dialogSrc.includes('可直接粘贴'), false)
  assert.equal(dialogSrc.includes('INPUT_HINT_TEXT'), false)
  const pricingSrc = fs.readFileSync(path.join(repoRoot, 'src/components/member/PricingPageContent.tsx'), 'utf8')
  assert.equal(pricingSrc.includes('立即购买'), true)
  assert.equal(pricingSrc.includes('立即订阅'), false)
  assert.equal(pricingSrc.includes('已有会员码'), false)
})
