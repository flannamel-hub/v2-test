import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'

/**
 * 派工单 B3:BLOG 后台「数据统计」只读端点(仅后台浏览器调用)。
 *
 * - 鉴权:与 banner / content-protect 等浏览器专用 admin 路由一致,
 *   路由内 verifyAdminRequest(Basic / internal_auth Cookie),未登录 401。
 * - 数据来源:共用库(service_role)两个只读 RPC,不直写任何表:
 *   · aggregate_blog_visit_daily(p_from_day, p_to_day, p_site_ids jsonb)
 *     → jsonb 数组行 {site_id, day, pv, uv, engine_pv, social_pv, direct_pv};
 *     其中 site_id=00000000-0000-0000-0000-000000000001 的平台合计行忽略,只取本 site。
 *   · blog_visit_today_live(p_day, p_site_ids jsonb)
 *     → jsonb 对象 {pv, uv, engine_pv, social_pv, direct_pv}(当日实时,Asia/Shanghai 自然日)。
 * - p_site_ids 固定传 [BLOG_SITE_ID](数组形式)。
 * - 失败(未配置/RPC 报错)返回 200 + success:false,前端面板统一显示「暂无数据」。
 */

const DAY_RANGE = 30

/** 平台合计行的固定 site_id(aggregate RPC 内硬编码),忽略之 */
const PLATFORM_TOTAL_SITE_ID = '00000000-0000-0000-0000-000000000001'

const SHANGHAI_DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function shanghaiDay(offsetDays = 0): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return SHANGHAI_DAY_FORMATTER.format(d)
}

type VisitDayRow = {
  day: string
  pv: number
  uv: number
  engine_pv: number
  social_pv: number
  direct_pv: number
}

type VisitTodayRow = {
  pv: number
  uv: number
  engine_pv: number
  social_pv: number
  direct_pv: number
}

type StatsResponse = {
  success: boolean
  fromDay?: string
  toDay?: string
  today?: VisitTodayRow | null
  days?: VisitDayRow[]
  error?: string
}

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function normalizeDayRow(raw: Record<string, unknown>): VisitDayRow {
  return {
    day: String(raw.day || '').slice(0, 10),
    pv: toNumber(raw.pv),
    uv: toNumber(raw.uv),
    engine_pv: toNumber(raw.engine_pv),
    social_pv: toNumber(raw.social_pv),
    direct_pv: toNumber(raw.direct_pv),
  }
}

function normalizeTodayRow(raw: unknown): VisitTodayRow | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  return {
    pv: toNumber(record.pv),
    uv: toNumber(record.uv),
    engine_pv: toNumber(record.engine_pv),
    social_pv: toNumber(record.social_pv),
    direct_pv: toNumber(record.direct_pv),
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatsResponse>
) {
  // 派工单 B5 自查:本端点仅调用只读 RPC,不直写表;ip_hmac 不经过本端点、不进任何日志。
  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ success: false, error: '未授权访问' })
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const siteId = process.env.BLOG_SITE_ID?.trim() || ''
  if (!siteId) {
    return res
      .status(200)
      .json({ success: false, error: '站点未配置(BLOG_SITE_ID 缺失)' })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return res
      .status(200)
      .json({ success: false, error: 'Supabase 未配置' })
  }

  // 近 30 天(含今日),day 均为 Asia/Shanghai 自然日(YYYY-MM-DD)
  const toDay = shanghaiDay(0)
  const fromDay = shanghaiDay(-(DAY_RANGE - 1))

  try {
    const [aggregateRes, todayRes] = await Promise.all([
      supabase.rpc('aggregate_blog_visit_daily', {
        p_from_day: fromDay,
        p_to_day: toDay,
        p_site_ids: [siteId],
      }),
      supabase.rpc('blog_visit_today_live', {
        p_day: toDay,
        p_site_ids: [siteId],
      }),
    ])

    if (aggregateRes.error) {
      console.warn(
        '[admin/stats] aggregate_blog_visit_daily 失败:',
        aggregateRes.error.message
      )
      return res.status(200).json({ success: false, error: '统计数据读取失败' })
    }
    if (todayRes.error) {
      console.warn(
        '[admin/stats] blog_visit_today_live 失败:',
        todayRes.error.message
      )
      return res.status(200).json({ success: false, error: '统计数据读取失败' })
    }

    const rawRows = Array.isArray(aggregateRes.data)
      ? (aggregateRes.data as Array<Record<string, unknown>>)
      : []
    // 只取本 site 行,忽略平台合计行;按 day 升序
    const days = rawRows
      .filter(
        (row) =>
          String(row.site_id || '') === siteId &&
          String(row.site_id || '') !== PLATFORM_TOTAL_SITE_ID
      )
      .map(normalizeDayRow)
      .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))

    const today = normalizeTodayRow(todayRes.data)

    return res.status(200).json({ success: true, fromDay, toDay, today, days })
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务端错误'
    return res.status(500).json({ success: false, error: message })
  }
}
