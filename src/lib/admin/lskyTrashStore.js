/**
 * Phase6 图床治理 —— 应用层回收站（localStorage）
 *
 * 兰空侧没有回收站概念，「移入回收站」仅写入本清单，不调用删除接口；
 * 满 7 天后由存储管理面板在进入时惰性清理（真删），期间可随时恢复。
 */

export const LSKY_TRASH_STORAGE_KEY = 'lsky_trash'
export const LSKY_TRASH_HISTORY_KEY = 'lsky_trash_history'
export const LSKY_TRASH_HISTORY_MAX = 50
export const LSKY_TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

const LSKY_TRASH_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/

function isBrowserStorageAvailable() {
  return (
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined' &&
    window.localStorage !== null
  )
}

function safeParseArray(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

function normalizeTrashEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const key = String(entry.key || '').trim()
  if (!LSKY_TRASH_KEY_RE.test(key)) return null
  return {
    key,
    name: String(entry.name || ''),
    size: Math.max(0, Number(entry.size) || 0),
    url: String(entry.url || ''),
    trashedAt: Number(entry.trashedAt) || Date.now(),
  }
}

/** 读取回收站清单（自动过滤损坏/非法条目） */
export function listLskyTrash() {
  if (!isBrowserStorageAvailable()) return []
  const raw = window.localStorage.getItem(LSKY_TRASH_STORAGE_KEY)
  return safeParseArray(raw)
    .map(normalizeTrashEntry)
    .filter(Boolean)
}

/** 覆盖式保存（按 key 去重，保留最后一次写入） */
export function saveLskyTrash(entries) {
  if (!isBrowserStorageAvailable()) return []
  const list = (Array.isArray(entries) ? entries : [])
    .map(normalizeTrashEntry)
    .filter(Boolean)
  const byKey = new Map()
  for (const entry of list) byKey.set(entry.key, entry)
  const next = Array.from(byKey.values())
  window.localStorage.setItem(LSKY_TRASH_STORAGE_KEY, JSON.stringify(next))
  return next
}

/** 追加条目（同 key 覆盖 trashedAt，重新计 7 天） */
export function addLskyTrashItems(entries) {
  const byKey = new Map(listLskyTrash().map((entry) => [entry.key, entry]))
  for (const entry of Array.isArray(entries) ? entries : []) {
    const normalized = normalizeTrashEntry(entry)
    if (normalized) byKey.set(normalized.key, normalized)
  }
  return saveLskyTrash(Array.from(byKey.values()))
}

/** 按 key 移除（恢复 / 清理成功后调用） */
export function removeLskyTrashKeys(keys) {
  const removeSet = new Set(
    (Array.isArray(keys) ? keys : []).map((key) => String(key))
  )
  const next = listLskyTrash().filter((entry) => !removeSet.has(entry.key))
  saveLskyTrash(next)
  return next
}

/** 距离自动清理还剩多少毫秒（≤0 表示已到期） */
export function getLskyTrashRemainingMs(entry, now = Date.now()) {
  const trashedAt = Number(entry && entry.trashedAt) || 0
  return trashedAt + LSKY_TRASH_RETENTION_MS - now
}

export function isLskyTrashExpired(entry, now = Date.now()) {
  return getLskyTrashRemainingMs(entry, now) <= 0
}

/** 读取清理历史（最多 LSKY_TRASH_HISTORY_MAX 条） */
export function listLskyTrashHistory() {
  if (!isBrowserStorageAvailable()) return []
  return safeParseArray(
    window.localStorage.getItem(LSKY_TRASH_HISTORY_KEY)
  )
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const key = String(entry.key || '')
      if (!LSKY_TRASH_KEY_RE.test(key)) return null
      return {
        key,
        name: String(entry.name || ''),
        size: Math.max(0, Number(entry.size) || 0),
        deletedAt: Number(entry.deletedAt) || Date.now(),
      }
    })
    .filter(Boolean)
}

/** 清理成功后写入历史（新条目在前，最多保留 50 条） */
export function pushLskyTrashHistory(entries) {
  if (!isBrowserStorageAvailable() || !Array.isArray(entries) || !entries.length) {
    return listLskyTrashHistory()
  }
  const items = entries
    .map((entry) => ({
      key: String((entry && entry.key) || ''),
      name: String((entry && entry.name) || ''),
      size: Math.max(0, Number(entry && entry.size) || 0),
      deletedAt: Date.now(),
    }))
    .filter((entry) => LSKY_TRASH_KEY_RE.test(entry.key))
  if (!items.length) return listLskyTrashHistory()
  const next = [...items, ...listLskyTrashHistory()].slice(
    0,
    LSKY_TRASH_HISTORY_MAX
  )
  window.localStorage.setItem(LSKY_TRASH_HISTORY_KEY, JSON.stringify(next))
  return next
}

export function clearLskyTrashHistory() {
  if (!isBrowserStorageAvailable()) return
  window.localStorage.removeItem(LSKY_TRASH_HISTORY_KEY)
}
