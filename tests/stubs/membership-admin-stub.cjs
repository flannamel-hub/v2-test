/** 测试专用 stub:替代 @/src/lib/supabase/admin(由 tests/membership-*.test.cjs 的
 * Module._resolveFilename 钩子重定向到本文件),避免真实 Supabase 依赖。 */
let client = null

module.exports = {
  __setSupabaseClient(value) {
    client = value
  },
  __reset() {
    client = null
  },
  getSupabaseAdmin() {
    return client
  },
}
