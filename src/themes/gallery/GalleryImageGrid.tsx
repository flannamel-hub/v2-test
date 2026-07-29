'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { preloadGalleryImages } from '@/src/lib/gallery/preloadGalleryImages'
import { GALLERY_POST_PAGE_SIZE } from './galleryConstants'
import { galleryMediaGridClass } from './galleryFonts'
import { GalleryGridImage } from './GalleryGridImage'
import { GalleryGridLoader } from './GalleryGridLoader'
import { GalleryLightbox } from './GalleryLightbox'
import type { ComponentType } from 'react'

type GalleryGridLoaderProps = {
  compact?: boolean
}

export type GalleryLoadStatus = {
  ready: boolean
  hasGallery: boolean
}

type GalleryApiImage = {
  id: string
  url: string
  thumb_url: string | null
  sort_order: number
}

type GalleryApiResponse = {
  success: boolean
  configured?: boolean
  total?: number
  images?: GalleryApiImage[]
  hasMore?: boolean
  error?: string
}

type GalleryImageGridProps = {
  postSlug: string
  pageSize?: number
  GridLoader?: ComponentType<GalleryGridLoaderProps>
  gridClassName?: string
  loadMoreClassName?: string
  onStatusChange?: (status: GalleryLoadStatus) => void
}

type GalleryPageResult = {
  list: GalleryApiImage[]
  total: number
  hasMore: boolean
}

export function GalleryImageGrid({
  postSlug,
  pageSize = GALLERY_POST_PAGE_SIZE,
  GridLoader = GalleryGridLoader,
  gridClassName = galleryMediaGridClass,
  loadMoreClassName = 'gallery-load-more-btn min-w-[140px] rounded-md bg-neutral-900 px-10 py-3 font-gallery text-[15px] font-semibold text-white transition-all duration-200 hover:bg-neutral-800 disabled:opacity-60',
  onStatusChange,
}: GalleryImageGridProps) {
  const [images, setImages] = useState<GalleryApiImage[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [contentReady, setContentReady] = useState(false)
  const [appendFrom, setAppendFrom] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)

  const fetchGalleryPage = useCallback(
    async (pageNum: number): Promise<GalleryPageResult> => {
      const res = await fetch(
        `/api/gallery/${encodeURIComponent(postSlug)}?page=${pageNum}&limit=${pageSize}`
      )
      const data: GalleryApiResponse = await res.json()
      if (!data.success) {
        throw new Error(data.error || '加载图库失败')
      }
      const list = data.images || []
      return {
        list,
        total: data.total || 0,
        hasMore: !!data.hasMore,
      }
    },
    [postSlug, pageSize]
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setContentReady(false)
    setError('')
    setPage(1)
    setAppendFrom(0)
    setLightboxIndex(null)
    onStatusChange?.({ ready: false, hasGallery: false })

    fetchGalleryPage(1)
      .then(({ list, total: count, hasMore: more }) => {
        if (cancelled) return
        const hasGallery = list.length > 0 || count > 0
        setTotal(count)
        setHasMore(more)
        setActive(hasGallery)
        setImages(list)
        onStatusChange?.({ ready: true, hasGallery })
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '加载失败')
          setActive(false)
          setImages([])
          onStatusChange?.({ ready: true, hasGallery: false })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [fetchGalleryPage, onStatusChange])

  useEffect(() => {
    if (loading) {
      setContentReady(false)
      return
    }
    const frame = requestAnimationFrame(() => setContentReady(true))
    return () => cancelAnimationFrame(frame)
  }, [loading])

  const loadMore = async () => {
    if (!hasMore || loadingMore) return
    const next = page + 1
    const baseline = images.length
    setLoadingMore(true)
    setError('')

    try {
      const { list, total: count, hasMore: more } =
        await fetchGalleryPage(next)

      const sources = list.map((img) => img.thumb_url || img.url)
      await preloadGalleryImages(sources)

      setImages((prev) => [...prev, ...list])
      setAppendFrom(baseline)
      setTotal(count)
      setHasMore(more)
      setPage(next)

      requestAnimationFrame(() => {
        const firstNew = gridRef.current?.querySelector(
          `[data-gallery-index="${baseline}"]`
        )
        firstNew?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
      setAppendFrom(0)
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading) {
    return <GridLoader />
  }

  if (!active) {
    if (error) {
      return (
        <p className="py-10 text-center text-sm text-red-500">{error}</p>
      )
    }
    return null
  }

  return (
    <div
      className={`gallery-grid-panel mb-10 ${contentReady ? 'gallery-grid-panel--ready' : ''}`}
    >
      {error ? (
        <p className="mb-4 text-center text-sm text-red-500">{error}</p>
      ) : null}

      <div
        ref={gridRef}
        className={gridClassName}
      >
        {images.map((img, index) => (
          <GalleryGridImage
            key={img.id}
            src={img.thumb_url || img.url}
            index={index}
            appendFrom={appendFrom}
            onOpen={() => setLightboxIndex(index)}
          />
        ))}
      </div>

      {loadingMore ? <GridLoader compact /> : null}

      {hasMore ? (
        <div
          className={`mt-10 flex justify-center transition-opacity duration-300 ${
            loadingMore ? 'pointer-events-none opacity-50' : 'opacity-100'
          }`}
        >
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className={loadMoreClassName}
          >
            {loadingMore ? '加载中…' : '显示更多'}
          </button>
        </div>
      ) : null}

      <GalleryLightbox
        open={lightboxIndex !== null}
        images={images}
        index={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
        onPrev={() =>
          setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i))
        }
        onNext={() =>
          setLightboxIndex((i) =>
            i !== null && i < images.length - 1 ? i + 1 : i
          )
        }
      />
    </div>
  )
}
