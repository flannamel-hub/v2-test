import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'
import { isValidBlogSiteId } from '@/src/lib/gallery/blogSite'
import { classifyUA, classifyReferrer } from '@/src/lib/stats/classify'

/**
 * BLOG 分层 P2:PV 批量上报内部接口(middleware fire-and-forget 调用)。
 *
 * - 仅接受 POST { site_id?: string, count: number, referrer?: string };
 *   count ∈ [1, 1000]。site_id 缺省时使用服务端 process.env.BLOG_SITE_ID。
 *   referrer(派工单 B1/B2,可选):客户端 document.referrer,空/缺失 = direct;
 *   旧 body 无此字段完全兼容。
 *   另按 STATS_HMAC_SALT 配置追加写访客事件 RPC flush_blog_visit_events(见下)。
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

  const body = req.body as
    | { site_id?: unknown; count?: unknown; referrer?: unknown }
    | null
    | undefined
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

  // === 派工单 B2:访客事件(IR /visit 维度)追加写,原 record_blog_usage_pv 路径不变 ===
  // - 字段名/枚举以单 A RPC flush_blog_visit_events(p_events jsonb) 为准:
  //   {site_id, ip_hmac(64hex), ua_class, referrer_class, ts(ISO), pv_count};RPC 内做防刷/坏载荷拒绝。
  // - 无 STATS_HMAC_SALT 环境变量 → 跳过本段(仅保留原路径),不报错。
  // - clientIp='unknown'/v6 本地地址仍计算 HMAC(不拦截);ip_hmac 绝不写入任何日志。
  // - 失败 console.warn 静默降级(沿用本文件风格),不影响响应,错误不返回非 200;
  //   RPC 结果中的 count 字段忽略(RPC 内兜底)。
  const statsHmacSalt = process.env.STATS_HMAC_SALT?.trim()
  if (statsHmacSalt) {
    try {
      const clientIp = getClientIp(req)
      const ipHmac = crypto
        .createHmac('sha256', statsHmacSalt)
        .update(clientIp)
        .digest('hex')
      const uaHeader = req.headers['user-agent']
      const { error: visitError } = await supabase.rpc(
        'flush_blog_visit_events',
        {
          p_events: [
            {
              site_id: siteId,
              ip_hmac: ipHmac,
              ua_class: classifyUA(Array.isArray(uaHeader) ? uaHeader[0] : uaHeader),
              referrer_class: classifyReferrer(
                typeof body?.referrer === 'string' ? body.referrer : ''
              ),
              ts: new Date().toISOString(),
              pv_count: count,
            },
          ],
        }
      )
      if (visitError) {
        console.warn(
          '[pv-flush] flush_blog_visit_events 失败:',
          visitError.message
        )
      }
    } catch (visitError) {
      console.warn(
        '[pv-flush] flush_blog_visit_events 异常:',
        visitError instanceof Error ? visitError.message : visitError
      )
    }
  }

  if (error) {
    console.warn('[pv-flush] 写入 blog_usage_pv_daily 失败:', error.message)
    return res.status(200).json({ success: true, stored: false })
  }
  return res.status(200).json({ success: true, stored: true })
}
