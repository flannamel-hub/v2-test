import { getBlogSiteId, getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'
import { getSiteThemeCode } from '@/src/lib/blog/siteTheme'
import { getPlatformThemeControls } from '@/src/lib/blog/platformThemeControls'

const TABLE = 'blog_site_settings'
const WINDOW_MS = 24 * 60 * 60 * 1000
export const THEME_SWITCH_MAX_PER_WINDOW = 4

export type ThemeSwitchQuotaStatus = {
  maxSwitches: number
  used: number
  remaining: number
  blocked: boolean
  windowStart: string | null
  windowEndsAt: string | null
  remainingMs: number
}

export class ThemeSwitchQuotaError extends Error {
  readonly code = 'THEME_SWITCH_QUOTA_EXCEEDED'
  readonly windowEndsAt: string | null
  readonly remainingMs: number

  constructor(windowEndsAt: string | null, remainingMs: number) {
    const hours = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)))
    super(`24 小时内主题切换已达上限（${THEME_SWITCH_MAX_PER_WINDOW} 次），约 ${hours} 小时后可再切换`)
    this.name = 'ThemeSwitchQuotaError'
    this.windowEndsAt = windowEndsAt
    this.remainingMs = remainingMs
  }
}

function buildStatus(
  windowStart: string | null,
  count: number,
  nowMs: number = Date.now()
): ThemeSwitchQuotaStatus {
  const max = THEME_SWITCH_MAX_PER_WINDOW

  if (!windowStart) {
    return {
      maxSwitches: max,
      used: 0,
      remaining: max,
      blocked: false,
      windowStart: null,
      windowEndsAt: null,
      remainingMs: 0,
    }
  }

  const startMs = new Date(windowStart).getTime()
  const endsMs = startMs + WINDOW_MS
  const remainingMs = endsMs - nowMs

  if (remainingMs <= 0) {
    return {
      maxSwitches: max,
      used: 0,
      remaining: max,
      blocked: false,
      windowStart: null,
      windowEndsAt: null,
      remainingMs: 0,
    }
  }

  const used = Math.max(0, count)
  const remaining = Math.max(0, max - used)
  const blocked = used >= max

  return {
    maxSwitches: max,
    used,
    remaining,
    blocked,
    windowStart,
    windowEndsAt: new Date(endsMs).toISOString(),
    remainingMs: blocked ? remainingMs : 0,
  }
}

export async function getThemeSwitchQuotaStatus(): Promise<ThemeSwitchQuotaStatus> {
  const siteId = getBlogSiteIdOrNull()
  const supabase = getSupabaseAdmin()
  if (!siteId || !supabase) {
    return buildStatus(null, 0)
  }

  // SYS-OPT1 V-A(拍板 1A)：平台开关停用 → 清零态(不拦不计；前端/API/assert 三处消费一致)
  const platform = await getPlatformThemeControls()
  if (!platform.limitEnabled) {
    return buildStatus(null, 0)
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('theme_switch_window_start, theme_switch_count')
    .eq('site_id', siteId)
    .maybeSingle()

  if (error) {
    return buildStatus(null, 0)
  }

  const windowStart = data?.theme_switch_window_start
    ? String(data.theme_switch_window_start)
    : null
  const count = Number(data?.theme_switch_count) || 0

  return buildStatus(windowStart, count)
}

/** 主题实际变更前校验（服务端） */
export async function assertThemeSwitchAllowed(
  previousCode: string | null | undefined,
  nextCode: string
): Promise<void> {
  const prev = String(previousCode || '').trim()
  const next = String(nextCode || '').trim()
  if (!next || prev === next) return

  // SYS-OPT1 V-A(拍板 1A)：平台开关停用=完全停用(不拦截)
  const platform = await getPlatformThemeControls()
  if (!platform.limitEnabled) return

  const status = await getThemeSwitchQuotaStatus()
  if (status.blocked) {
    throw new ThemeSwitchQuotaError(status.windowEndsAt, status.remainingMs)
  }
}

/** 主题切换成功后计入配额 */
export async function recordThemeSwitchIfNeeded(
  previousCode: string | null | undefined,
  nextCode: string
): Promise<void> {
  const prev = String(previousCode || '').trim()
  const next = String(nextCode || '').trim()
  if (!next || prev === next) return

  // SYS-OPT1 V-A(拍板 1A)：平台开关停用=不计入配额(重开从零由平台侧 P-E 清零负责)
  const platform = await getPlatformThemeControls()
  if (!platform.limitEnabled) return

  const siteId = getBlogSiteId()
  const supabase = getSupabaseAdmin()
  if (!supabase) return

  const nowIso = new Date().toISOString()
  const status = await getThemeSwitchQuotaStatus()

  const windowActive = Boolean(
    status.windowStart &&
      status.windowEndsAt &&
      Date.now() < new Date(status.windowEndsAt).getTime()
  )

  const windowStart = windowActive ? status.windowStart! : nowIso
  const count = windowActive
    ? Math.min(THEME_SWITCH_MAX_PER_WINDOW, status.used + 1)
    : 1

  const { error: updateError } = await supabase
    .from(TABLE)
    .update({
      theme_switch_window_start: windowStart,
      theme_switch_count: count,
      updated_at: nowIso,
    })
    .eq('site_id', siteId)

  if (updateError) {
    const currentTheme = (await getSiteThemeCode()) || next
    const { error: upsertError } = await supabase.from(TABLE).upsert(
      {
        site_id: siteId,
        theme_code: currentTheme,
        theme_switch_window_start: windowStart,
        theme_switch_count: count,
        updated_at: nowIso,
      },
      { onConflict: 'site_id' }
    )
    if (upsertError) throw new Error(upsertError.message)
  }
}
