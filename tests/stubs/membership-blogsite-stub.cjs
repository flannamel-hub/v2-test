/** 测试专用 stub:替代 @/src/lib/gallery/blogSite(由 tests/membership-*.test.cjs 的
 * Module._resolveFilename 钩子重定向到本文件),避免环境变量依赖。 */
let siteId = null

module.exports = {
  __setBlogSiteId(value) {
    siteId = value
  },
  __reset() {
    siteId = null
  },
  getBlogSiteIdOrNull() {
    return siteId
  },
}
