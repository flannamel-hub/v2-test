/** 测试专用 stub:替代 @/src/lib/admin/verifyAdminRequest。
 * 由 tests/member-editor-roundtrip.test.cjs 与 tests/membership-state-api.test.cjs 的
 * Module._resolveFilename 钩子重定向到本文件;默认放行(true),可按用例切换 401。 */
let allowed = true

module.exports = {
  __setAllowed(value) {
    allowed = value
  },
  __reset() {
    allowed = true
  },
  verifyAdminRequest() {
    return allowed
  },
}
