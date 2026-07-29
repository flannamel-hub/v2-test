'use client'

import { GalleryImageGrid } from '@/src/themes/gallery/GalleryImageGrid'
import type { GalleryLoadStatus } from '@/src/themes/gallery/GalleryImageGrid'
import { TweetGalleryGridLoader } from './TweetGalleryGridLoader'

type TweetGallerySectionProps = {
  postSlug: string
  onStatusChange?: (status: GalleryLoadStatus) => void
}

export function TweetGallerySection({
  postSlug,
  onStatusChange,
}: TweetGallerySectionProps) {
  return (
    <div className="tweet-gallery-section gallery-content-container">
      <GalleryImageGrid
        postSlug={postSlug}
        GridLoader={TweetGalleryGridLoader}
        onStatusChange={onStatusChange}
      />
    </div>
  )
}
