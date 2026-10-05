/** 站点会员 R5-C:会员区「固定尾区 + 纯文本输入区」纯函数（无 React 依赖）。
 * 协议边界（派工单红线）：member 块数据格式与前台切分、post.js 读写序列化零改动；
 * 本库只服务于编辑器侧 join/split/判据/落块，落块后数组形态与现行「全文本会员区」一致
 * （marker + 纯 text 块），structuredToBlocks / blocksToMarkdown 无需感知本批新逻辑。 */
import {
  createEditorBlock,
  isEditorBlockLocked,
} from '@/src/lib/admin/editorBlockLock'

/**
 * 可转换判据（C3-1）：区段 (markerIndex, n] 每块均为
 * type='text' 且未锁定且无格式修饰（bold/italic/color 非 default）。
 * 区段为空（0 块）→ 可转换（空输入区）。任一块不满足 → 回退原块模式（C4）。
 */
export function isMemberZoneTextConvertible(blocks, markerIndex) {
  if (!Array.isArray(blocks)) return false
  if (!(markerIndex >= 0)) return false
  for (let i = markerIndex + 1; i < blocks.length; i++) {
    const b = blocks[i]
    if (!b || b.type !== 'text') return false
    if (isEditorBlockLocked(b)) return false
    if (b.bold) return false
    if (b.italic) return false
    if ((b.color || 'default') !== 'default') return false
  }
  return true
}

/** 区段块 → 文本：各 text 块 content 以空行（\n\n）连接；跳过空内容块与非 text 块（回退模式下的死状态） */
export function memberZoneTextFromBlocks(zoneBlocks) {
  return (zoneBlocks || [])
    .map((b) => (b && b.type === 'text' ? String(b.content ?? '') : ''))
    .filter(Boolean)
    .join('\n\n')
}

/** 文本 → 区段块：空行分段；段内单换行逐字保留在 content 内（沿用现 text 块序列化口径） */
export function memberBlocksFromText(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((content) => ({ ...createEditorBlock('text'), content }))
}

/** 落块：marker 及其之前原样保留，其后只余 text 块；返回新数组；markerIndex<0 原样返回 */
export function flushMemberZoneBlocks(blocks, text) {
  if (!Array.isArray(blocks)) return blocks
  const markerIndex = blocks.findIndex((b) => b && b.type === 'member')
  if (markerIndex < 0) return blocks
  return [...blocks.slice(0, markerIndex + 1), ...memberBlocksFromText(text)]
}

/** 计数 chip（文本模式）：非空段数 */
export function memberZoneParagraphCount(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .reduce((n, seg) => (seg.trim() ? n + 1 : n), 0)
}
