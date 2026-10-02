/** 测试专用 stub:替代 @/src/lib/notion/getBlocks(getAllBlocks 可配置),
 * 供 member-content-api / member-unlock-split 测试注入正文块夹具。 */
let blocks = []
let calls = 0

module.exports = {
  __reset() {
    blocks = []
    calls = 0
  },
  __setBlocks(value) {
    blocks = value
  },
  __getCalls() {
    return calls
  },
  async getAllBlocks(pageId) {
    calls += 1
    if (typeof blocks === 'function') return blocks(pageId)
    return blocks
  },
}
