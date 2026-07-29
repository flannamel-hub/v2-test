import { fetchUrlPreview } from '@/src/lib/blog/fetchUrlPreview'
import { getWidgetPages } from '@/src/lib/notion/getDatabase'
import {
  readCoverFromPageProperties,
  readRichTextPlain,
} from '@/src/lib/notion/readProperty'
import { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'

export type GalleryAdBanner = {
  url: string
  imageSrc: string | null
  promoText: string | null
}

const GALLERY_AD_SLUG = 'gallery-ad'
/** 失败结果短缓存，避免 ISR 同实例内把 null 永久固化 */
const NULL_CACHE_TTL_MS = 45_000

let buildCache: GalleryAdBanner | null | undefined
let buildCacheNullAt = 0

export function clearGalleryAdBannerCache(): void {
  buildCache = undefined
  buildCacheNullAt = 0
}

async function findGalleryAdWidget(
  widgetPages?: PageObjectResponse[]
): Promise<PageObjectResponse | null> {
  const results = widgetPages ?? (await getWidgetPages())
  return (
    results.find(
      (page) =>
        page.properties['type']?.type === 'select' &&
        page.properties['type'].select?.name === 'Widget' &&
        readRichTextPlain(page.properties.slug) === GALLERY_AD_SLUG
    ) ?? null
  )
}

export async function loadGalleryAdBanner(
  widgetPages?: PageObjectResponse[]
): Promise<GalleryAdBanner | null> {
  if (buildCache !== undefined) {
    if (buildCache !== null) return buildCache
    if (Date.now() - buildCacheNullAt < NULL_CACHE_TTL_MS) return null
    buildCache = undefined
  }

  const raw = await findGalleryAdWidget(widgetPages)
  if (!raw) {
    buildCache = null
    buildCacheNullAt = Date.now()
    return null
  }

  const url = readRichTextPlain(raw.properties.excerpt) || ''
  if (!url.startsWith('http')) {
    buildCache = null
    buildCacheNullAt = Date.now()
    return null
  }

  const coverOverride = readCoverFromPageProperties(raw.properties)

  let imageSrc: string | null = coverOverride
  if (!imageSrc) {
    try {
      const preview = await fetchUrlPreview(url)
      imageSrc =
        preview.image?.startsWith('http') ? preview.image : null
    } catch {
      imageSrc = null
    }
  }

  const rawTitle = readRichTextPlain(raw.properties.title) || ''
  const promoText =
    rawTitle && rawTitle !== '广告位' ? rawTitle : null

  if (!imageSrc && !promoText) {
    buildCache = null
    buildCacheNullAt = Date.now()
    return null
  }

  buildCache = {
    url,
    imageSrc,
    promoText,
  }
  buildCacheNullAt = 0
  return buildCache
}
