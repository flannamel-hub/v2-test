const DEFAULT_IMAGE_HOST_ORIGIN = 'https://img.x1file.top'

export type ImageHostPublicConfig = {
  version: number
  publicAssetOrigin: string
  legacyAssetOrigins: string[]
}

export type ImageHostRuntimeConfig = ImageHostPublicConfig & {
  uploadApiOrigin: string
}

const defaultRuntimeConfig: ImageHostRuntimeConfig = {
  version: 0,
  uploadApiOrigin: DEFAULT_IMAGE_HOST_ORIGIN,
  publicAssetOrigin: DEFAULT_IMAGE_HOST_ORIGIN,
  legacyAssetOrigins: [],
}

let runtimeConfig = defaultRuntimeConfig

export function normalizeImageHostOrigin(rawOrigin: unknown): string {
  const value = String(rawOrigin || '').trim().toLowerCase()
  if (!/^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(value)) {
    throw new Error('图床地址必须是仅含域名的 HTTPS origin')
  }

  const parsed = new URL(value)
  const labels = parsed.hostname.split('.')
  if (parsed.hostname.length > 253 || labels.length < 2) {
    throw new Error('图床地址必须使用完整域名')
  }
  if (
    labels.some(
      (label) =>
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label) ||
        label.length > 63
    ) ||
    !/[a-z]/.test(labels[labels.length - 1])
  ) {
    throw new Error('图床域名格式无效')
  }

  const port = parsed.port ? Number.parseInt(parsed.port, 10) : 443
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('图床端口无效')
  }
  return `https://${parsed.hostname}${port === 443 ? '' : `:${port}`}`
}

function normalizeVersion(rawVersion: unknown): number {
  const version = Number(rawVersion)
  if (!Number.isInteger(version) || version < 0) {
    throw new Error('图床配置版本无效')
  }
  return version
}

function normalizeLegacyOrigins(
  rawOrigins: unknown,
  publicAssetOrigin: string
): string[] {
  if (!Array.isArray(rawOrigins)) {
    throw new Error('图床历史 origin 配置无效')
  }
  return Array.from(
    new Set(rawOrigins.map((origin) => normalizeImageHostOrigin(origin)))
  ).filter((origin) => origin !== publicAssetOrigin)
}

export function normalizeImageHostConfig(
  input: Record<string, unknown>
): ImageHostRuntimeConfig {
  const uploadApiOrigin = normalizeImageHostOrigin(
    input.uploadApiOrigin ?? input.upload_api_origin
  )
  const publicAssetOrigin = normalizeImageHostOrigin(
    input.publicAssetOrigin ?? input.public_asset_origin
  )
  const legacyAssetOrigins = normalizeLegacyOrigins(
    input.legacyAssetOrigins ?? input.legacy_asset_origins ?? [],
    publicAssetOrigin
  )

  return {
    version: normalizeVersion(input.version),
    uploadApiOrigin,
    publicAssetOrigin,
    legacyAssetOrigins,
  }
}

export function normalizePublicImageHostConfig(
  input: Record<string, unknown>
): ImageHostPublicConfig {
  const publicAssetOrigin = normalizeImageHostOrigin(
    input.publicAssetOrigin ?? input.public_asset_origin
  )
  return {
    version: normalizeVersion(input.version),
    publicAssetOrigin,
    legacyAssetOrigins: normalizeLegacyOrigins(
      input.legacyAssetOrigins ?? input.legacy_asset_origins ?? [],
      publicAssetOrigin
    ),
  }
}

export function setRuntimeImageHostConfig(
  config: ImageHostRuntimeConfig
): void {
  runtimeConfig = normalizeImageHostConfig(config as unknown as Record<string, unknown>)
}

export function getRuntimeImageHostConfig(): ImageHostRuntimeConfig {
  return runtimeConfig
}

function serializeWithOrigin(url: URL, origin: string): string {
  return `${origin}${url.pathname}${url.search}${url.hash}`
}

export function rewriteManagedAssetUrl(
  rawUrl: string | null | undefined,
  config: ImageHostPublicConfig
): string {
  if (!rawUrl) return rawUrl || ''
  const value = String(rawUrl).trim()
  if (!value || !/^https?:\/\//i.test(value)) return value

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return value
  }

  if (parsed.protocol !== 'https:') return value
  const publicOrigin = normalizeImageHostOrigin(config.publicAssetOrigin)
  if (parsed.origin === publicOrigin) return value

  const legacyOrigins = new Set(
    config.legacyAssetOrigins.map((origin) => normalizeImageHostOrigin(origin))
  )
  if (!legacyOrigins.has(parsed.origin)) return value
  return serializeWithOrigin(parsed, publicOrigin)
}

export function normalizeUploadedAssetUrl(
  rawUrl: string | null | undefined,
  config: ImageHostRuntimeConfig
): string {
  const value = String(rawUrl || '').trim()
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('图床未返回有效图片地址')
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('图床未返回安全的 HTTPS 图片地址')
  }

  const normalized = normalizeImageHostConfig(
    config as unknown as Record<string, unknown>
  )
  const allowedOrigins = new Set([
    normalized.uploadApiOrigin,
    normalized.publicAssetOrigin,
    ...normalized.legacyAssetOrigins,
  ])
  if (!allowedOrigins.has(parsed.origin)) {
    throw new Error('图床返回了未受管理的图片域名')
  }
  return serializeWithOrigin(parsed, normalized.publicAssetOrigin)
}

export function rewriteManagedSrcSet(
  rawSrcSet: string | null | undefined,
  config: ImageHostPublicConfig
): string {
  const value = String(rawSrcSet || '')
  if (!value || /(?:^|\s)data:/i.test(value)) return value

  return value
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim()
      if (!trimmed) return trimmed
      const match = trimmed.match(/^(\S+)(\s+.*)?$/)
      if (!match) return trimmed
      return `${rewriteManagedAssetUrl(match[1], config)}${match[2] || ''}`
    })
    .join(', ')
}
