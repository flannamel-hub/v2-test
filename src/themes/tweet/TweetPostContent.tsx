'use client'

import { useState } from 'react'
import { BlockRender } from '@/src/components/blocks/BlockRender'
import { BlockResponse } from '@/src/types/notion'
import { MathJaxContext } from 'better-react-mathjax'
import {
  filterGalleryBodyBlocks,
  hasGalleryBodyContent,
} from '@/src/themes/gallery/galleryPostBlocks'
import type { GalleryLoadStatus } from '@/src/themes/gallery/GalleryImageGrid'
import { TweetGallerySection } from './TweetGallerySection'

type TweetPostContentProps = {
  postSlug: string
  blocks: BlockResponse[]
}

export function TweetPostContent({ postSlug, blocks }: TweetPostContentProps) {
  const [{ ready, hasGallery }, setGalleryStatus] = useState<GalleryLoadStatus>({
    ready: false,
    hasGallery: false,
  })
  const bodyBlocks = filterGalleryBodyBlocks(blocks, hasGallery)
  const showBody = hasGalleryBodyContent(blocks, hasGallery)

  return (
    <MathJaxContext>
      <div className="tweet-post-content overflow-hidden break-words">
        <TweetGallerySection
          postSlug={postSlug}
          onStatusChange={setGalleryStatus}
        />

        {ready && showBody ? (
          <div className={hasGallery ? 'tweet-post-content__body mt-6' : ''}>
            <div className="prose-tweet">
              <BlockRender blocks={bodyBlocks} variant="tweet" />
            </div>
          </div>
        ) : null}

        {ready && !hasGallery && !showBody ? (
          <p className="tweet-post-content__empty">暂无内容</p>
        ) : null}
      </div>
    </MathJaxContext>
  )
}
