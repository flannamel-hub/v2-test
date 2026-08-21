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
