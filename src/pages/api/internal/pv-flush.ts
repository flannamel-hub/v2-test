import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'
import { isValidBlogSiteId } from '@/src/lib/gallery/blogSite'

/**
 * BLOG 分层 P2:PV 批量上报内部接口(middleware fire-and-forget 调用)。
 *
 * - 仅接受 POST { site_id?: string, count: number };count ∈ [1, 1000]。
 *   site_id 缺省时使用服务端 process.env.BLOG_SITE_ID。
 * - 轻量防刷(非权威计费,主站 FOCUS 对账兜底):
 *   1) Origin/Referer 存在时必须匹配本站 host;服务端(middleware edge fetch)
 *      可能两头皆缺,此时仅依赖 IP 限流。
 *   2) 进程内按 IP 限流:每 60 秒每 IP 最多 30 次。
 * - day 按 Asia/Shanghai 自然日;写入失败静默降级(console.warn),
 *   始终返回 200,不影响前台。
 */

const COUNT_MIN = 1
const COUNT_MAX = 1000
const RATE_WINDOW_MS = 60_000
const RATE_MAX_PER_WINDOW = 30
const RATE_MAP_MAX_ENTRIES = 5000

const SHANGHAI_DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const rateBuckets = new Map<string, { start: number; count: number }>()

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim()
  }
  return String(req.socket.remoteAddress || 'unknown')
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(ip)
  if (!bucket || now - bucket.start >= RATE_WINDOW_MS) {
    if (rateBuckets.size > RATE_MAP_MAX_ENTRIES) rateBuckets.clear()
    rateBuckets.set(ip, { start: now, count: 1 })
    return false
  }
  bucket.count += 1
  return bucket.count > RATE_MAX_PER_WINDOW
}

function isSelfOriginRequest(req: NextApiRequest): boolean {
  const host = String(req.headers.host || '')
  if (!host) return false

  const origin = String(req.headers.origin || '')
  if (origin) {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }

  const referer = String(req.headers.referer || '')
  if (referer) {
    try {
      return new URL(referer).host === host
    } catch {
      return false
    }
  }

  // 服务端(middleware edge fetch)可能不携带 Origin/Referer;交由 IP 限流兜底
  return true
}

function shanghaiDay(): string {
  return SHANGHAI_DAY_FORMATTER.format(new Date())
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  if (!isSelfOriginRequest(req)) {
    return res.status(403).json({ success: false, error: 'Forbidden' })
  }

  if (isRateLimited(getClientIp(req))) {
    return res.status(429).json({ success: false, error: 'Too many requests' })
  }

  const body = req.body as { site_id?: unknown; count?: unknown } | null | undefined
  const siteIdFromBody =
    typeof body?.site_id === 'string' && body.site_id.trim()
      ? body.site_id.trim()
      : ''
  const siteId = siteIdFromBody || process.env.BLOG_SITE_ID?.trim() || ''
  const count = Number(body?.count)

  if (!siteId || !isValidBlogSiteId(siteId)) {
    return res.status(400).json({ success: false, error: 'Invalid site' })
  }
  if (!Number.isInteger(count) || count < COUNT_MIN || count > COUNT_MAX) {
    return res.status(400).json({ success: false, error: 'Invalid count' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    console.warn('[pv-flush] Supabase 未配置,丢弃 PV 上报')
    return res.status(200).json({ success: true, stored: false })
  }

  const { error } = await supabase.rpc('record_blog_usage_pv', {
    p_site_id: siteId,
    p_day: shanghaiDay(),
    p_count: count,
  })

  if (error) {
    console.warn('[pv-flush] 写入 blog_usage_pv_daily 失败:', error.message)
    return res.status(200).json({ success: true, stored: false })
  }
  return res.status(200).json({ success: true, stored: true })
}
