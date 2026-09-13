/**
 * 隐藏文章（status=Hidden 的 type=Post 文章）前台过滤工具。
 *
 * 语义边界（EDITOR_HIDDEN_POSTS_BRIEF）：
 * - 「隐藏文章」判据严格为 type === 'Post' && status === 'Hidden'。
 * - Page / Widget 的 Hidden 是系统组件「关闭」开关语义（banner、vending、
 *   theme-config、friends 等），严禁当作隐藏文章处理（否则误伤系统组件开关）。
 * - 前台各列表入口的数据源均来自 ApiScope.Archive + type=Post 过滤
 *   （getPosts / getPostsAndPieces），天然不含 Page/Widget；type 字段缺省时
 *   按 Post 处理，以兼容格式化后的 Post 对象（其无 type 字段）。
 * - 直链（post/[post].tsx 的 getPostBySlug）不走此过滤，Hidden 文章链接仍可访问。
 */

/** 是否为隐藏文章（仅精确 Hidden 视为隐藏；容错大小写与首尾空白） */
export function isHiddenPost(post: {
  status?: string | null
  type?: string | null
}): boolean {
  const status = String(post?.status ?? '')
    .trim()
    .toLowerCase()
  if (status !== 'hidden') return false
  const type = String(post?.type ?? '').trim()
  return !type || type === 'Post'
}

/** 列表过滤：剔除隐藏文章（仅 Hidden Post 被过滤，其余状态原样保留） */
export function filterVisiblePosts<
  T extends { status?: string | null; type?: string | null }
>(posts: T[]): T[] {
  if (!Array.isArray(posts)) return []
  return posts.filter((post) => !isHiddenPost(post))
}
