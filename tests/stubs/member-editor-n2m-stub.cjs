/** 测试专用 stub:替代 notion-to-md。
 * pageToMarkdown 返回可配置的 md 块数组;toMarkdownString 以 \n\n 连接 parent
 * (与真实现一致,GET 归一化用例据此检查 cleanContent)。 */
let pageToMarkdownResult = []

class NotionToMarkdown {
  constructor() {}
  async pageToMarkdown() {
    return pageToMarkdownResult
  }
  toMarkdownString(mdblocks) {
    return { parent: (mdblocks || []).map((b) => b.parent || '').join('\n\n') }
  }
}

module.exports = {
  NotionToMarkdown,
  __setPageToMarkdown(value) {
    pageToMarkdownResult = value
  },
  __reset() {
    pageToMarkdownResult = []
  },
}
