import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { listGalleryImages } from '@/src/lib/gallery/galleryDb'
import { normalizeMediaUrl } from '@/src/lib/notion/readProperty'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'
import { getImageHostConfig } from '@/src/lib/media/imageHostConfig'
import {
  ImageHostRuntimeConfig,
  rewriteManagedAssetUrl,
} from '@/src/lib/media/rewriteManagedAssetUrl'

export type GalleryFeedPreview = {
  total: number
  thumbs: string[]
}

type GalleryFeedPreviewRow = {
  post_slug: string
  image_count: number
  url: string
  thumb_url: string | null
  sort_order: number
}

function normalizeThumbUrl(
  thumbUrl: string | null | undefined,
  url: string,
  config: ImageHostRuntimeConfig
): string {
  const raw = (thumbUrl || url || '').trim()
  if (!raw) return ''
  return rewriteManagedAssetUrl(normalizeMediaUrl(raw) || raw, config)
}

function isMissingGalleryFeedPreviewsRpc(error: {
  code?: string
  message?: string
}): boolean {
  const code = String(error.code || '')
  const message = String(error.message || '')
  return (
    code === '42883' ||
    code === 'PGRST202' ||
    (/get_gallery_feed_previews/i.test(message) &&
      /not found|schema cache/i.test(message))
  )
}

async function loadGalleryFeedPreviewsLegacy(
  slugs: string[],
  thumbLimit: number,
  imageHostConfig: ImageHostRuntimeConfig
): Promise<Record<string, GalleryFeedPreview>> {
  const sb = getSupabaseAdmin()
  const siteId = getBlogSiteIdOrNull()
  if (!sb || !siteId) return {}

  const { data: galleries, error } = await sb
    .from('galleries')
    .select('post_slug, image_count')
    .eq('site_id', siteId)
    .in('post_slug', slugs)

  if (error) throw error
  if (!galleries?.length) return {}

  const slugsWithGallery = galleries
    .filter((gallery) => (gallery.image_count ?? 0) > 0)
    .map((gallery) => gallery.post_slug as string)

  const results: Record<string, GalleryFeedPreview> = {}

  await Promise.all(
    slugsWithGallery.map(async (slug) => {
      try {
        const { images, total } = await listGalleryImages(slug, 1, thumbLimit)
        const thumbs = images
          .map((img) =>
            normalizeThumbUrl(img.thumb_url, img.url, imageHostConfig)
          )
          .filter(Boolean)
        if (!thumbs.length) return
        results[slug] = { total, thumbs }
      } catch (err) {
        console.warn('[galleryFeedPreviews] load failed:', slug, err)
      }
    })
  )

  return results
}

/**
 * 批量读取首页/列表卡片用的图库缩略图（每篇最多 thumbLimit 张）。
 */
export async function loadGalleryFeedPreviews(
  slugs: string[],
  thumbLimit = 6
): Promise<Record<string, GalleryFeedPreview>> {
  const uniqueSlugs = [...new Set(slugs.filter(Boolean))]
  if (!uniqueSlugs.length) return {}

  const imageHostConfig = await getImageHostConfig()

  const sb = getSupabaseAdmin()
  const siteId = getBlogSiteIdOrNull()
  if (!sb || !siteId) return {}

  const safeThumbLimit = Math.min(Math.max(Number(thumbLimit) || 1, 1), 12)
  const { data, error } = await sb.rpc('get_gallery_feed_previews', {
    p_site_id: siteId,
    p_slugs: uniqueSlugs,
    p_thumb_limit: safeThumbLimit,
  })

  if (error) {
    if (isMissingGalleryFeedPreviewsRpc(error)) {
      return loadGalleryFeedPreviewsLegacy(
        uniqueSlugs,
        safeThumbLimit,
        imageHostConfig
      )
    }
    throw error
  }

  const results: Record<string, GalleryFeedPreview> = {}
  for (const row of (data || []) as GalleryFeedPreviewRow[]) {
    const thumb = normalizeThumbUrl(
      row.thumb_url,
      row.url,
      imageHostConfig
    )
    if (!thumb) continue
    const preview = results[row.post_slug] || {
      total: row.image_count,
      thumbs: [],
    }
    if (preview.thumbs.length < safeThumbLimit) {
      preview.thumbs.push(thumb)
    }
    results[row.post_slug] = preview
  }

  return results
}

/** 列表卡片用：每篇取图库第一张缩略图作为封面候选 */
export async function loadGalleryFeedCovers(
  slugs: string[]
): Promise<Record<string, string>> {
  const previews = await loadGalleryFeedPreviews(slugs, 1)
  const covers: Record<string, string> = {}
  for (const [slug, preview] of Object.entries(previews)) {
    const first = preview.thumbs[0]
    if (first) covers[slug] = first
  }
  return covers
}
