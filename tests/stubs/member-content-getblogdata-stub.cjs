/** 测试专用 stub:替代 @/src/lib/notion/getBlogData(getPostBySlug 可配置),
 * 供 member-content-api / member-unlock-split 测试注入夹具文章。 */
let postBySlug = null
let calls = 0

module.exports = {
  __reset() {
    postBySlug = null
    calls = 0
  },
  __setPostBySlug(value) {
    postBySlug = value
  },
  __getCalls() {
    return calls
  },
  async getPostBySlug(slug) {
    calls += 1
    if (typeof postBySlug === 'function') return postBySlug(slug)
    return postBySlug
  },
}
