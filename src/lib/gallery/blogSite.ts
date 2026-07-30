import { isSupabaseGalleryConfigured } from '@/src/lib/supabase/admin'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidBlogSiteId(siteId: string): boolean {
  return UUID_RE.test(siteId.trim())
}

/** 当前 Blog 部署绑定的商户站点 ID（merchant_services.id） */
export function getBlogSiteId(): string {
  const siteId = process.env.BLOG_SITE_ID?.trim()
  if (!siteId) {
    throw new Error('站点身份尚未配置')
  }
  if (!isValidBlogSiteId(siteId)) {
    throw new Error('站点身份配置无效')
  }
  return siteId
}

export function getBlogSiteIdOrNull(): string | null {
  const siteId = process.env.BLOG_SITE_ID?.trim()
  if (!siteId || !isValidBlogSiteId(siteId)) return null
  return siteId
}

/** 图库 / 统计：Supabase + BLOG_SITE_ID 均已配置 */
export function isGalleryTenantConfigured(): boolean {
  return isSupabaseGalleryConfigured() && Boolean(getBlogSiteIdOrNull())
}

/** 每商户图库容量上限（字节），默认 GALLERY_QUOTA_GB=50 */
export function getGalleryQuotaBytes(): number {
  const raw = process.env.GALLERY_QUOTA_GB?.trim()
  const gb = raw ? parseFloat(raw) : 50
  if (!Number.isFinite(gb) || gb <= 0) {
    return 50 * 1024 * 1024 * 1024
  }
  return gb * 1024 * 1024 * 1024
}

export function formatGalleryStorageBytes(bytes: number): string {
  const n = Math.max(0, Number(bytes) || 0)
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}
