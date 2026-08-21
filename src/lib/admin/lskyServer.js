export function getLskyBase() {
  return (process.env.LSKY_URL || 'https://img.x1file.top').replace(/\/+$/, '')
}

export function getLskyAuthorization() {
  let token = process.env.LSKY_TOKEN || ''
  if (!token) return null
  if (!/^bearer\s/i.test(token)) token = `Bearer ${token}`
  return token
}

export function extractLskyImageUrl(data) {
  return data?.data?.links?.url || data?.url || ''
}

/**
 * Phase6 图床治理：文件 key 白名单（防注入路径，DELETE /api/v1/images/{key}）
 * 兰空 key 为字母/数字/下划线/短横线组成，长度不超过 64
 */
export const LSKY_FILE_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/

export function isValidLskyFileKey(key) {
  return typeof key === 'string' && LSKY_FILE_KEY_RE.test(key)
}
