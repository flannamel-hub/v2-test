import { getBlogSiteId, getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { assertGalleryStorageQuota } from '@/src/lib/gallery/galleryStorage'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'

export type GalleryImageRow = {
  id: string
  url: string
  thumb_url: string | null
  sort_order: number
  file_size?: number | null
}

export type GalleryMeta = {
  id: string
  site_id: string
  post_slug: string
  post_notion_id: string | null
  title: string | null
  image_count: number
}

const PAGE_SIZE_MAX = 48

export async function getGalleryMetaBySlug(
  postSlug: string
): Promise<GalleryMeta | null> {
  const sb = getSupabaseAdmin()
  const siteId = getBlogSiteIdOrNull()
  if (!sb || !siteId) return null
  const { data, error } = await sb
    .from('galleries')
    .select('id, site_id, post_slug, post_notion_id, title, image_count')
    .eq('site_id', siteId)
    .eq('post_slug', postSlug)
    .maybeSingle()
  if (error) throw error
  return data as GalleryMeta | null
}

export async function listGalleryImages(
  postSlug: string,
  page: number,
  limit: number
): Promise<{
  meta: GalleryMeta | null
  images: GalleryImageRow[]
  total: number
  page: number
  limit: number
  totalPages: number
  hasMore: boolean
}> {
  const safeLimit = Math.min(Math.max(limit, 1), PAGE_SIZE_MAX)
  const safePage = Math.max(page, 1)
  const meta = await getGalleryMetaBySlug(postSlug)
  if (!meta) {
    return {
      meta: null,
      images: [],
      total: 0,
      page: safePage,
      limit: safeLimit,
      totalPages: 0,
      hasMore: false,
    }
  }

  const from = (safePage - 1) * safeLimit
  const to = from + safeLimit - 1

  const sb = getSupabaseAdmin()
  if (!sb) {
    return {
      meta,
      images: [],
      total: 0,
      page: safePage,
      limit: safeLimit,
      totalPages: 0,
      hasMore: false,
    }
  }

  const siteId = getBlogSiteIdOrNull()
  if (!siteId) {
    return {
      meta,
      images: [],
      total: 0,
      page: safePage,
      limit: safeLimit,
      totalPages: 0,
      hasMore: false,
    }
  }
  const { data, error, count } = await sb
    .from('gallery_images')
    .select('id, url, thumb_url, sort_order', { count: 'exact' })
    .eq('site_id', siteId)
    .eq('gallery_id', meta.id)
    .order('sort_order', { ascending: true })
    .range(from, to)

  if (error) throw error

  const total = count ?? meta.image_count ?? 0
  const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 0

  return {
    meta,
    images: (data || []) as GalleryImageRow[],
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
    hasMore: safePage < totalPages,
  }
}

export async function listAllGalleryImagesForAdmin(
  postSlug: string
): Promise<{ meta: GalleryMeta | null; images: GalleryImageRow[] }> {
  const meta = await getGalleryMetaBySlug(postSlug)
  if (!meta) return { meta: null, images: [] }

  const sb = getSupabaseAdmin()
  const siteId = getBlogSiteIdOrNull()
  if (!sb || !siteId) return { meta, images: [] }

  const { data, error } = await sb
    .from('gallery_images')
    .select('id, url, thumb_url, sort_order, file_size')
    .eq('site_id', siteId)
    .eq('gallery_id', meta.id)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return { meta, images: (data || []) as GalleryImageRow[] }
}

export async function syncGalleryImages(input: {
  postSlug: string
  postNotionId?: string | null
  title?: string | null
  images: {
    url: string
    thumb_url?: string | null
    file_size?: number | null
  }[]
}): Promise<{ meta: GalleryMeta; imageCount: number }> {
  const sb = getSupabaseAdmin()
  if (!sb) {
    throw new Error('图库服务尚未配置，请联系管理')
  }

  const siteId = getBlogSiteId()
  const slug = input.postSlug.trim()
  if (!slug) throw new Error('post_slug 不能为空')

  await assertGalleryStorageQuota({
    postSlug: slug,
    images: input.images || [],
  })

  const { data: galleryRow, error: upsertError } = await sb
    .from('galleries')
    .upsert(
      {
        site_id: siteId,
        post_slug: slug,
        post_notion_id: input.postNotionId || null,
        title: input.title || null,
      },
      { onConflict: 'site_id,post_slug' }
    )
    .select('id, site_id, post_slug, post_notion_id, title, image_count')
    .single()

  if (upsertError) throw upsertError

  const galleryId = galleryRow.id as string

  const { data: existingRows, error: existErr } = await sb
    .from('gallery_images')
    .select('url, file_size')
    .eq('site_id', siteId)
    .eq('gallery_id', galleryId)
  if (existErr) throw existErr

  const sizeByUrl = new Map(
    (existingRows || []).map((r) => [r.url as string, r.file_size as number | null])
  )

  const { error: delError } = await sb
    .from('gallery_images')
    .delete()
    .eq('site_id', siteId)
    .eq('gallery_id', galleryId)
  if (delError) throw delError

  const rows = (input.images || [])
    .map((img, index) => ({
      gallery_id: galleryId,
      site_id: siteId,
      url: img.url,
      thumb_url: img.thumb_url || img.url,
      sort_order: index,
      file_size:
        img.file_size != null && img.file_size > 0
          ? Math.round(img.file_size)
          : sizeByUrl.get(img.url) ?? null,
    }))
    .filter((r) => r.url)

  if (rows.length > 0) {
    const { error: insError } = await sb.from('gallery_images').insert(rows)
    if (insError) throw insError
  }

  const { data: refreshed, error: refError } = await sb
    .from('galleries')
    .select('id, site_id, post_slug, post_notion_id, title, image_count')
    .eq('site_id', siteId)
    .eq('id', galleryId)
    .single()

  if (refError) throw refError

  return {
    meta: refreshed as GalleryMeta,
    imageCount: refreshed?.image_count ?? rows.length,
  }
}
