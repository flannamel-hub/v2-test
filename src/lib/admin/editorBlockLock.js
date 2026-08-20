/** 编辑器块加密：通用字段与归一化（保证二次打开编辑不丢状态） */

export function isEditorBlockLocked(block) {
  if (!block) return false
  return block.type === 'lock' || !!block.locked
}

export function getEditorBlockLockPwd(block) {
  if (!block) return ''
  if (block.type === 'lock') return String(block.pwd ?? block.lockPwd ?? '').trim()
  return String(block.lockPwd ?? block.pwd ?? '').trim()
}

export function createEditorBlock(type) {
  return {
    id: Date.now() + Math.random(),
    type,
    // Phase5：toggle 的 content 为行数组
    content: type === 'toggle' ? [] : '',
    pwd: '',
    lockPwd: '',
    locked: false,
    url: '',
    images: [],
    bold: false,
    italic: false,
    color: 'default',
    checked: [],
    isCover: false,
  }
}

/** 从 API / Markdown 解析结果归一化，避免 undefined 导致保存时字段丢失 */
export function normalizeLoadedEditorBlock(block, id) {
  if (!block || typeof block !== 'object') {
    return { ...createEditorBlock('text'), id: id ?? Date.now() + Math.random() }
  }
  const type = block.type || 'text'
  const lockPwd =
    type === 'lock'
      ? String(block.pwd ?? block.lockPwd ?? '')
      : String(block.lockPwd ?? block.pwd ?? '')
  const locked = type === 'lock' ? true : !!block.locked
  return {
    ...block,
    id: id ?? block.id ?? Date.now() + Math.random(),
    type,
    content: block.content ?? '',
    url: block.url ?? '',
    images: Array.isArray(block.images) ? block.images : [],
    pwd: type === 'lock' ? lockPwd : String(block.pwd ?? ''),
    lockPwd: type === 'lock' ? lockPwd : String(block.lockPwd ?? block.pwd ?? ''),
    locked,
    bold: !!block.bold,
    italic: !!block.italic,
    color: block.color || 'default',
    checked: Array.isArray(block.checked) ? block.checked : [],
    isCover: !!block.isCover,
  }
}

export function normalizeLoadedEditorBlocks(blocks) {
  return (blocks || []).map((b, i) =>
    normalizeLoadedEditorBlock(b, Date.now() + i + Math.random())
  )
}
