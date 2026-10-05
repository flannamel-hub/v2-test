/**
 * 站点会员 R4-B:UI 常量/导出面最低用例集(派工单 §11.1-S8 定转正)。
 * - ① INPUT_PLACEHOLDER_TEXT 逐字断言(7A 文案,含「登录」字样;替换旧「会员码」);
 * - ② CrownIcon 为可导出函数(M2 改导出,供 pricing CTA/公告卡按钮复用);
 * - ③ SESSION_CACHE_TTL_MS === 60000(60s 模块级缓存 TTL)。
 * 交互面(开窗过渡/快判时序/CTA 样式)由 Hermes §7 截图矩阵覆盖,EXEC_NOTES 已登记。
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

test('INPUT_PLACEHOLDER_TEXT:逐字一致(7A;含「登录」字样;替换旧「会员码」)', () => {
  assert.equal(loginDialog.INPUT_PLACEHOLDER_TEXT, '请输入登录key或上传身份码')
  assert.ok(loginDialog.INPUT_PLACEHOLDER_TEXT.includes('登录'))
  assert.notEqual(loginDialog.INPUT_PLACEHOLDER_TEXT, '会员码')
})

test('CrownIcon:为可导出函数(M2 改导出,供 pricing CTA/公告卡复用)', () => {
  assert.equal(typeof memberNav.CrownIcon, 'function')
})

test('SESSION_CACHE_TTL_MS === 60000(R4-B1 模块级探测缓存 60s TTL)', () => {
  assert.equal(loginDialog.SESSION_CACHE_TTL_MS, 60000)
})
