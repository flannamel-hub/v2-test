/** 测试专用 stub:替代 @/src/lib/blog/format/block(formatBlocks 直通),
 * 供 member-content-api / member-unlock-split 测试避免真实 Notion/图床链路。 */
let formatCalls = 0

module.exports = {
  __reset() {
    formatCalls = 0
  },
  __getFormatCalls() {
    return formatCalls
  },
  async formatBlocks(blocks) {
    formatCalls += 1
    return blocks
  },
}
