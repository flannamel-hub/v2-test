import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'

// SYS-OPT1 V-A：平台级主题控制读取（单例表 blog_platform_settings，迁移 025）。
// fail-safe 硬语义：缺行/读失败/缺表/脏数据 → limitEnabled=true（现行为）、disabledThemes=[]；
// 15s TTL 且「只缓存成功读取」——失败不缓存（防把默认值带过 DB 抖动期，评审 R5）；
// 缺表/失败时 warn 提示先执行迁移 025。

const TABLE = 'blog_platform_settings'
const DEFAULT_CACHE_TTL_MS = 15_000

export type PlatformThemeControls = {
  limitEnabled: boolean
  disabledThemes: string[]
}

let cache: { value: PlatformThemeControls; expiresAt: number } | null = null
let cacheTtlMsForTest: number | null = null

/** 规范 ThemeId 八项（与 disabledThemes 存储口径一致） */
export const PLATFORM_THEME_IDS = [
  'anzifan',
  'touchgal',
  'gallery',
  'tweet',
  'tweet-light',
  'tweet-dark',
  'shop',
  'shop-v2',
] as const

/**
 * 主题代号归一（镜像 src/themes/registry.ts resolveThemeId 的别名族）。
 * 不直接 import registry——那会把 React 主题组件树拉进 API 路由 bundle 与
 * node 测试链；此处仅取其归一语义（照 post.js isShopThemeCode 范式，勘误 E4）。
 */
export function normalizeThemeId(code: unknown): string {
  const c = String(code == null ? '' : code).trim().toLowerCase()
  if (c === 'v2' || c === 'touchgal') return 'touchgal'
  if (c === 'gallery') return 'gallery'
  if (c === 'tweet-light' || c === 'tweet_light') return 'tweet-light'
  if (c === 'tweet-dark' || c === 'tweet_dark') return 'tweet-dark'
  if (c === 'tweet' || c === 'morethan-log' || c === 'morethanlog' || c === 'v3') {
    return 'tweet'
  }
  if (c === 'v1' || c === 'anzifan' || c === 'standard') return 'anzifan'
  if (c === 'shop' || c === 'mall') return 'shop'
  if (c === 'shop-v2' || c === 'shopv2') return 'shop-v2'
  return 'anzifan'
}

const VALID_THEME_IDS = new Set<string>(PLATFORM_THEME_IDS)

/** 清洗 disabled_themes：非数组→[]；逐项归一去重；规范八项之外过滤 */
export function sanitizeDisabledThemes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const id = normalizeThemeId(item)
    if (!VALID_THEME_IDS.has(id) || out.includes(id)) continue
    out.push(id)
  }
  return out
}

export async function getPlatformThemeControls(): Promise<PlatformThemeControls> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) {
    return cache.value
  }

  const siteId = getBlogSiteIdOrNull()
  const supabase = getSupabaseAdmin()
  if (!siteId || !supabase) {
    return { limitEnabled: true, disabledThemes: [] }
  }

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('theme_switch_limit_enabled, disabled_themes')
      .eq('id', 1)
      .maybeSingle()

    if (error || !data) {
      console.warn(
        '[platformThemeControls] blog_platform_settings 读取失败/缺行(按默认处理;若表缺失请先执行迁移 025):',
        error ? error.message : 'no row'
      )
      return { limitEnabled: true, disabledThemes: [] }
    }

    const value: PlatformThemeControls = {
      limitEnabled: data.theme_switch_limit_enabled !== false,
      disabledThemes: sanitizeDisabledThemes(data.disabled_themes),
    }
    cache = { value, expiresAt: now + (cacheTtlMsForTest ?? DEFAULT_CACHE_TTL_MS) }
    return value
  } catch (e) {
    console.warn(
      '[platformThemeControls] blog_platform_settings 读取异常(按默认处理):',
      e instanceof Error ? e.message : e
    )
    return { limitEnabled: true, disabledThemes: [] }
  }
}

/** 测试辅助：重置 TTL 缓存；可选覆盖 TTL 毫秒数（不传/非法值恢复默认） */
export function __resetPlatformThemeControlsCacheForTest(ttlMs?: number): void {
  cache = null
  cacheTtlMsForTest =
    typeof ttlMs === 'number' && Number.isFinite(ttlMs) && ttlMs >= 0 ? ttlMs : null
}
