import { createHash } from 'node:crypto'
import type { BlockDataType } from '@/src/types/blog'

/**
 * 站点会员 B2:会员区内容服务端缓存(进程内 module-level Map)。
 *
 * 口径备注:
 * - serverless 多实例下进程内缓存失效为 best-effort,120s TTL 为兜底口径;
 * - ETag/304 服务于客户端应用层内存缓存(MemberContentGate)流程,
 *   不依赖浏览器 HTTP 缓存(内容 API 响应带 no-store);
 * - etag 归一化:bulleted_list / numbered_list 是 format/block.ts mergeListItems
 *   的合成壳块(id=randomUUID,同一 Notion 数据两次 formatBlocks 产物不同),哈希前
 *   递归替换为固定占位,保证 etag 跨缓存再生稳定;Notion 原生块 id 不动。
 */

const MEMBER_CONTENT_CACHE_TTL_MS = 120_000
const MEMBER_CONTENT_CACHE_MAX_ENTRIES = 200

export type MemberContentCacheEntry = {
  blocks: BlockDataType[]
  etag: string
  expiresAt: number
}

const LIST_SHELL_PLACEHOLDER_ID = '__member_content_list_shell__'
const LIST_SHELL_TYPES = new Set(['bulleted_list', 'numbered_list'])

const memberContentCacheMap = new Map<string, MemberContentCacheEntry>()

/** 递归把合成列表壳块 id 替换为固定占位(就地修改,调用方传入深拷贝) */
function canonicalizeForEtag(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) canonicalizeForEtag(item)
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as Record<string, unknown>
  if (
    typeof record.type === 'string' &&
    LIST_SHELL_TYPES.has(record.type) &&
    typeof record.id === 'string'
  ) {
    record.id = LIST_SHELL_PLACEHOLDER_ID
  }
  for (const key of Object.keys(record)) {
    canonicalizeForEtag(record[key])
  }
}

/** 归一化后取 sha256 前 16 位作为 etag */
export function computeMemberContentEtag(blocks: unknown[]): string {
  const canonicalized = JSON.parse(JSON.stringify(Array.isArray(blocks) ? blocks : []))
  canonicalizeForEtag(canonicalized)
  return createHash('sha256')
    .update(JSON.stringify(canonicalized))
    .digest('hex')
    .slice(0, 16)
}

function buildCacheKey(siteId: string, slug: string): string {
  return `${siteId}:${slug}`
}

/** 溢出时先清已过期,再按插入序淘汰最旧(不用 for..of 遍历 Map,避开 TS2802) */
function evictIfNeeded(): void {
  if (memberContentCacheMap.size <= MEMBER_CONTENT_CACHE_MAX_ENTRIES) return
  const now = Date.now()
  memberContentCacheMap.forEach((entry, key) => {
    if (entry.expiresAt <= now) memberContentCacheMap.delete(key)
  })
  while (memberContentCacheMap.size > MEMBER_CONTENT_CACHE_MAX_ENTRIES) {
    const oldestKey = memberContentCacheMap.keys().next().value
    if (oldestKey === undefined) break
    memberContentCacheMap.delete(oldestKey)
  }
}

/** 命中返回条目(含 blocks + etag);过期即删并返回 null */
export function readMemberContentCache(
  siteId: string,
  slug: string
): MemberContentCacheEntry | null {
  if (!siteId || !slug) return null
  const key = buildCacheKey(siteId, slug)
  const entry = memberContentCacheMap.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    memberContentCacheMap.delete(key)
    return null
  }
  return entry
}

/** 写入(重写同 key 会刷新插入序与 TTL);返回写入的条目供调用方直接使用 */
export function writeMemberContentCache(
  siteId: string,
  slug: string,
  blocks: BlockDataType[]
): MemberContentCacheEntry {
  const key = buildCacheKey(siteId, slug)
  const entry: MemberContentCacheEntry = {
    blocks: Array.isArray(blocks) ? blocks : [],
    etag: computeMemberContentEtag(blocks),
    expiresAt: Date.now() + MEMBER_CONTENT_CACHE_TTL_MS,
  }
  memberContentCacheMap.delete(key)
  memberContentCacheMap.set(key, entry)
  evictIfNeeded()
  return entry
}

/** 按 slug 失效(匹配任意 siteId 前缀);slug 缺省/空 = 全清(兜底口径) */
export function invalidateMemberContentCache(slug?: string): void {
  const trimmed = typeof slug === 'string' ? slug.trim() : ''
  if (!trimmed) {
    memberContentCacheMap.clear()
    return
  }
  const suffix = `:${trimmed}`
  for (const key of Array.from(memberContentCacheMap.keys())) {
    if (key.endsWith(suffix)) memberContentCacheMap.delete(key)
  }
}

/** 全清(供 clearContentBuildCaches 复用) */
export function clearMemberContentCache(): void {
  memberContentCacheMap.clear()
}
