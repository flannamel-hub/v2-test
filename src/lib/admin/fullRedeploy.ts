import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'

const TABLE = 'blog_site_settings'
const COOLDOWN_MS = 12 * 60 * 60 * 1000

/** 进程内兜底（无 Supabase 时尽力限制） */
const memoryLastRedeploy = new Map<string, number>()

function getDeployHookUrl(): string | null {
  const url =
    process.env.VERCEL_DEPLOY_HOOK_URL?.trim() ||
    process.env.VERCEL_REDEPLOY_HOOK_URL?.trim()
  return url || null
}

async function readLastRedeployMs(siteId: string): Promise<number | null> {
  const supabase = getSupabaseAdmin()
  if (supabase) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('last_full_redeploy_at')
      .eq('site_id', siteId)
      .maybeSingle()

    if (!error && data?.last_full_redeploy_at) {
      const ms = new Date(data.last_full_redeploy_at).getTime()
      if (!Number.isNaN(ms)) return ms
    }
  }

  const mem = memoryLastRedeploy.get(siteId)
  return typeof mem === 'number' ? mem : null
}

async function writeLastRedeployMs(siteId: string, atMs: number): Promise<void> {
  memoryLastRedeploy.set(siteId, atMs)

  const supabase = getSupabaseAdmin()
  if (!supabase) return

  const at = new Date(atMs).toISOString()
  const { error: updateError } = await supabase
    .from(TABLE)
    .update({ last_full_redeploy_at: at, updated_at: at })
    .eq('site_id', siteId)

  if (!updateError) return

  const { error: upsertError } = await supabase.from(TABLE).upsert(
    {
      site_id: siteId,
      theme_code: 'gallery',
      last_full_redeploy_at: at,
      updated_at: at,
    },
    { onConflict: 'site_id' }
  )

  if (upsertError) {
    throw new Error(upsertError.message)
  }
}

export type FullRedeployStatus = {
  configured: boolean
  available: boolean
  retryAfterSec: number
}

export async function getFullRedeployStatus(): Promise<FullRedeployStatus> {
  const configured = Boolean(getDeployHookUrl())
  const siteId = getBlogSiteIdOrNull()

  if (!siteId) {
    return { configured, available: false, retryAfterSec: 0 }
  }

  const lastMs = await readLastRedeployMs(siteId)
  if (!lastMs) {
    return { configured, available: configured, retryAfterSec: 0 }
  }

  const remaining = COOLDOWN_MS - (Date.now() - lastMs)
  if (remaining <= 0) {
    return { configured, available: configured, retryAfterSec: 0 }
  }

  return {
    configured,
    available: false,
    retryAfterSec: Math.ceil(remaining / 1000),
  }
}

export async function triggerFullRedeploy(): Promise<void> {
  const hookUrl = getDeployHookUrl()
  if (!hookUrl) {
    throw new Error('全量更新服务尚未配置，请联系管理')
  }

  const siteId = getBlogSiteIdOrNull()
  if (!siteId) {
    throw new Error('站点身份尚未配置，请联系管理')
  }

  const status = await getFullRedeployStatus()
  if (!status.available) {
    const hours = Math.ceil(status.retryAfterSec / 3600)
    throw new Error(`全量更新 12 小时内仅可使用一次，请约 ${hours} 小时后再试`)
  }

  const res = await fetch(hookUrl, { method: 'POST' })
  if (!res.ok) {
    throw new Error(`触发全量更新失败（${res.status}）`)
  }

  await writeLastRedeployMs(siteId, Date.now())
}
