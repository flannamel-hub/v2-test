import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'

const TABLE = 'blog_site_settings'

// TTL 短缓存(≤30s):仅承载「成功读取」的真实值(true/false 均可);
// 缓存过期后的读取失败一律返回 false —— 不做 last-known-good(评审 C3:
// LKG 会把 true 带过 DB 抖动期,与 fail-closed 语义矛盾)。
const DEFAULT_CACHE_TTL_MS = 15_000

type GalleryGateCache = {
  value: boolean
  expiresAt: number
}

let cache: GalleryGateCache | null = null
let cacheTtlMsForTest: number | null = null

/**
 * 图库功能开关(blog_site_settings.gallery_feature_enabled,迁移 021)。
 * fail-closed 硬语义:BLOG_SITE_ID / Supabase 未配置、读取失败、表或列缺失、
 * 无行、值非 true → 一律 false;缺列/失败时 warn 提示(先执行迁移 021)。
 * 消费方:api/admin/post.js 主题保存守卫、processCrawlerGalleryRow 爬虫门控、
 * gallery / gallery-storage 管理 API 503 门控。
 */
export async function getGalleryFeatureEnabled(): Promise<boolean> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) {
    return cache.value
  }

  const siteId = getBlogSiteIdOrNull()
  const supabase = getSupabaseAdmin()
  if (!siteId || !supabase) {
    return false
  }

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('gallery_feature_enabled')
      .eq('site_id', siteId)
      .maybeSingle()

    if (error) {
      // 缺列(迁移 021 未执行)等读取错误:fail-closed,不缓存失败值
      console.warn(
        '[galleryFeatureGate] blog_site_settings 读取失败(按 false 处理;若列缺失请先执行迁移 021):',
        error.message
      )
      return false
    }
    if (!data) {
      // 无行:fail-closed,不缓存
      return false
    }

    const value = data.gallery_feature_enabled === true
    cache = {
      value,
      expiresAt: now + (cacheTtlMsForTest ?? DEFAULT_CACHE_TTL_MS),
    }
    return value
  } catch (e) {
    console.warn(
      '[galleryFeatureGate] blog_site_settings 读取异常(按 false 处理):',
      e instanceof Error ? e.message : e
    )
    return false
  }
}

/**
 * 图库功能开关写入口（批2【版本修复】页专用）。
 * update→upsert 范式（照 vendingSettings.syncLegacyVendingEnabled）：
 * 先按 site_id update；update 报错或无行（返回行数 0）时 upsert 兜底
 * （onConflict:'site_id'，仅写 site_id / gallery_feature_enabled / updated_at，
 * 不触碰其它列）。成功后立即刷新模块 TTL 缓存，保证本实例后续读取拿到新值。
 * 失败 throw（由 API 层归类 500「数据库尚未升级…」/503 文案）。
 */
export async function setGalleryFeatureEnabled(enabled: boolean): Promise<void> {
  const siteId = getBlogSiteIdOrNull()
  const supabase = getSupabaseAdmin()
  if (!siteId || !supabase) {
    throw new Error('站点配置不可用')
  }

  const now = new Date().toISOString()
  const { data: updatedRows, error: updateError } = await supabase
    .from(TABLE)
    .update({ gallery_feature_enabled: enabled, updated_at: now })
    .eq('site_id', siteId)
    .select('site_id')

  if (updateError || !updatedRows || updatedRows.length === 0) {
    const { error: upsertError } = await supabase
      .from(TABLE)
      .upsert(
        {
          site_id: siteId,
          gallery_feature_enabled: enabled,
          updated_at: now,
        },
        { onConflict: 'site_id' }
      )
    if (upsertError) {
      throw new Error(upsertError.message)
    }
  }

  cache = {
    value: enabled,
    expiresAt: Date.now() + (cacheTtlMsForTest ?? DEFAULT_CACHE_TTL_MS),
  }
}

/** 测试辅助:重置 TTL 缓存;可选覆盖 TTL 毫秒数(不传/非法值恢复默认) */
export function __resetGalleryFeatureGateCacheForTest(ttlMs?: number): void {
  cache = null
  cacheTtlMsForTest =
    typeof ttlMs === 'number' && Number.isFinite(ttlMs) && ttlMs >= 0
      ? ttlMs
      : null
}
