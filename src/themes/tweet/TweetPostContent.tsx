'use client'

import { useState } from 'react'
import { MemberAwareBlockRender, useMemberContent } from '@/src/components/post/MemberAwareBlockRender'
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
  // 站点会员 B2:纯会员文(marker 在首块,公开区为空)时正文区仍需渲染(gate 占位正文位)
  const memberEnabled = !!useMemberContent()?.enabled
  const showBodyArea = showBody || memberEnabled

  return (
    <MathJaxContext>
      <div className="tweet-post-content overflow-hidden break-words">
        <TweetGallerySection
          postSlug={postSlug}
          onStatusChange={setGalleryStatus}
        />

        {ready && showBodyArea ? (
          <div className={hasGallery ? 'tweet-post-content__body mt-6' : ''}>
            <div className="prose-tweet">
              <MemberAwareBlockRender blocks={bodyBlocks} variant="tweet" postSlug={postSlug} />
            </div>
          </div>
        ) : null}

        {ready && !hasGallery && !showBody && !memberEnabled ? (
          <p className="tweet-post-content__empty">暂无内容</p>
        ) : null}
      </div>
    </MathJaxContext>
  )
}
