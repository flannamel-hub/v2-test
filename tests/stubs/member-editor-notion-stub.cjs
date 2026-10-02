/** 测试专用 stub:替代 @notionhq/client(兼作 @/src/lib/blog/contentRevalidation 的
 * 最小形状桩——后者仅用到 collectPostRevalidatePaths,真模块会拉入主题 tsx 组件链,
 * node --test 下无法解析;两说明符重定向到本文件共享同一模块实例)。
 * 由 tests/member-editor-roundtrip.test.cjs 的 Module._resolveFilename 钩子重定向。 */

let pagesRetrieveImpl = async () => null
let databasesRetrieveResult = { properties: {} }
let blocksChildrenByParent = new Map()
let appendedCalls = []
let createdPages = []
let deletedBlockIds = []
let updatedPages = []

class Client {
  constructor() {
    this.pages = {
      retrieve: (args) => pagesRetrieveImpl(args),
      update: (args) => {
        updatedPages.push(args)
        return Promise.resolve({})
      },
      create: (args) => {
        createdPages.push(args)
        return Promise.resolve({ id: 'new-page-1' })
      },
    }
    this.blocks = {
      children: {
        list: ({ block_id }) =>
          Promise.resolve({ results: blocksChildrenByParent.get(block_id) || [] }),
        append: (args) => {
          appendedCalls.push(args)
          return Promise.resolve({})
        },
      },
      delete: ({ block_id }) => {
        deletedBlockIds.push(block_id)
        return Promise.resolve({})
      },
    }
    this.databases = {
      query: () => Promise.resolve({ results: [] }),
      retrieve: () => Promise.resolve(databasesRetrieveResult),
      update: () => Promise.resolve({}),
    }
  }
}

function isFullPage(page) {
  return !!page
}

module.exports = {
  Client,
  isFullPage,
  // —— contentRevalidation 最小形状(本测试不触及 revalidate 路径) ——
  collectPostRevalidatePaths: async () => [],
  __setPagesRetrieve(impl) {
    pagesRetrieveImpl = impl
  },
  __setDatabasesProperties(properties) {
    databasesRetrieveResult = { properties }
  },
  __setBlocksChildren(blockId, results) {
    blocksChildrenByParent.set(blockId, results)
  },
  __getAppendedCalls() {
    return appendedCalls
  },
  __clearAppendedCalls() {
    appendedCalls = []
  },
  __getCreatedPages() {
    return createdPages
  },
  __getDeletedBlockIds() {
    return deletedBlockIds
  },
  __getUpdatedPages() {
    return updatedPages
  },
  __reset() {
    pagesRetrieveImpl = async () => null
    databasesRetrieveResult = { properties: {} }
    blocksChildrenByParent = new Map()
    appendedCalls = []
    createdPages = []
    deletedBlockIds = []
    updatedPages = []
  },
}
