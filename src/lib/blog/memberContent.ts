import type { BlockResponse } from '@/src/types/notion'

/**
 * 站点会员 B2:会员分隔线标记与正文切分纯函数。
 * - 标记 = callout 块,rich_text 纯文本 trim 后恰为 MEMBER:(大小写敏感,附加内容不识别);
 * - 只认顶层(depth 0),多条标记以第一条为切分点;
 * - 标记块本身及其 children 不进任何区;后续标记块留在会员区(B3 编辑器收敛);
 * - 读侧宽松识别;写侧标准形态(附录 B 协议)由 B3 编辑器落地。
 */

export const MEMBER_MARKER_TEXT = 'MEMBER:'

export type MemberBlocksSplit = {
  publicBlocks: BlockResponse[]
  memberBlocks: BlockResponse[]
  hasMemberContent: boolean
}

function isMemberMarkerBlock(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false
  const record = block as Record<string, unknown>
  if (record.type !== 'callout') return false
  const callout = record.callout
  if (!callout || typeof callout !== 'object') return false
  const richText = (callout as Record<string, unknown>).rich_text
  if (!Array.isArray(richText)) return false
  const text = richText
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const plain = (item as Record<string, unknown>).plain_text
      return typeof plain === 'string' ? plain : ''
    })
    .join('')
    .trim()
  return text === MEMBER_MARKER_TEXT
}

/**
 * 顶层扫描:首个 callout(MEMBER:) 之前的块为公开区、之后的块为会员区;
 * 标记块本身及其 children 不进任何区;无标记 → memberBlocks=[], hasMemberContent=false。
 * 输入非法(非数组)→ 安全返回全空三件;纯函数、零依赖。
 *
 * 泛型说明:formatBlocks 产物是 BlockDataType[](BlockResponse 与合成列表壳等的联合),
 * 泛型化以兼容两类调用方;以 BlockResponse[] 调用时返回结构即 MemberBlocksSplit。
 */
export function splitBlocksOnMemberMarker<T>(
  blocks: T[]
): {
  publicBlocks: T[]
  memberBlocks: T[]
  hasMemberContent: boolean
} {
  if (!Array.isArray(blocks)) {
    return { publicBlocks: [] as T[], memberBlocks: [] as T[], hasMemberContent: false }
  }
  const publicBlocks: T[] = []
  const memberBlocks: T[] = []
  let markerFound = false
  for (const block of blocks) {
    if (!markerFound && isMemberMarkerBlock(block)) {
      markerFound = true
      continue
    }
    if (markerFound) {
      memberBlocks.push(block)
    } else {
      publicBlocks.push(block)
    }
  }
  return { publicBlocks, memberBlocks, hasMemberContent: markerFound }
}
