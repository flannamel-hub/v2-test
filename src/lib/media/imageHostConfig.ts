import { getSupabaseAdmin } from '@/src/lib/supabase/admin'
import {
  ImageHostRuntimeConfig,
  normalizeImageHostConfig,
  normalizeImageHostOrigin,
  setRuntimeImageHostConfig,
} from '@/src/lib/media/rewriteManagedAssetUrl'

const DEFAULT_IMAGE_HOST_ORIGIN = 'https://img.x1file.top'
const CACHE_TTL_MS = 15_000
const ERROR_CACHE_TTL_MS = 5_000

type CachedConfig = {
  config: ImageHostRuntimeConfig
  expiresAt: number
}

let cachedConfig: CachedConfig | null = null
let lastKnownGood: ImageHostRuntimeConfig | null = null
let inflight: Promise<ImageHostRuntimeConfig> | null = null

function createFallbackConfig(): ImageHostRuntimeConfig {
  let fallbackOrigin = DEFAULT_IMAGE_HOST_ORIGIN
  try {
    fallbackOrigin = normalizeImageHostOrigin(
      process.env.LSKY_URL || DEFAULT_IMAGE_HOST_ORIGIN
    )
  } catch {
    console.error('[image-host] LSKY_URL 无效，已使用兼容旧域名')
  }
  return {
    version: 0,
    uploadApiOrigin: fallbackOrigin,
    publicAssetOrigin: fallbackOrigin,
    legacyAssetOrigins: [],
  }
}

function remember(config: ImageHostRuntimeConfig, ttlMs: number): ImageHostRuntimeConfig {
  cachedConfig = { config, expiresAt: Date.now() + ttlMs }
  setRuntimeImageHostConfig(config)
  return config
}

function safeErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'unknown error'
  const record = error as { code?: unknown; message?: unknown }
  const code = String(record.code || '').slice(0, 40)
  const message = String(record.message || '读取失败')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 160)
  return code ? `${code}: ${message}` : message
}

async function loadImageHostConfig(): Promise<ImageHostRuntimeConfig> {
  const fallback = lastKnownGood || createFallbackConfig()
  const client = getSupabaseAdmin()
  if (!client) return remember(fallback, CACHE_TTL_MS)

  try {
    const { data, error } = await client
      .from('blog_image_host_config')
      .select(
        'upload_api_origin, public_asset_origin, legacy_asset_origins, version'
      )
      .eq('id', 1)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('共享图床配置不存在')

    const config = normalizeImageHostConfig(data as Record<string, unknown>)
    lastKnownGood = config
    return remember(config, CACHE_TTL_MS)
  } catch (error) {
    console.error(
      `[image-host] 共享配置读取失败，已使用 ${
        lastKnownGood ? 'last-known-good' : '兼容配置'
      }：${safeErrorMessage(error)}`
    )
    return remember(fallback, ERROR_CACHE_TTL_MS)
  }
}

export async function getImageHostConfig(options?: {
  forceRefresh?: boolean
}): Promise<ImageHostRuntimeConfig> {
  if (
    !options?.forceRefresh &&
    cachedConfig &&
    cachedConfig.expiresAt > Date.now()
  ) {
    setRuntimeImageHostConfig(cachedConfig.config)
    return cachedConfig.config
  }

  if (!inflight) {
    inflight = loadImageHostConfig().finally(() => {
      inflight = null
    })
  }
  return inflight
}

/** 仅让下一次读取重新访问共享库；保留 LKG 供数据库短暂故障时回退。 */
export function clearImageHostConfigCache(): void {
  cachedConfig = null
}
