'use client'

import { useState } from 'react'
import { MemberAwareBlockRender, useMemberContent } from '@/src/components/post/MemberAwareBlockRender'
import { BlockResponse } from '@/src/types/notion'
import { MathJaxContext } from 'better-react-mathjax'
import { GalleryImageGrid } from './GalleryImageGrid'
import type { GalleryLoadStatus } from './GalleryImageGrid'
import {
  filterGalleryBodyBlocks,
  hasGalleryBodyContent,
} from './galleryPostBlocks'
import { galleryProseClass } from './galleryFonts'

type GalleryPostContentProps = {
  postSlug: string
  blocks: BlockResponse[]
}

const proseBorderedClass = `${galleryProseClass} rounded-sm border border-neutral-200 bg-white px-6 py-8 md:px-10`

export function GalleryPostContent({ postSlug, blocks }: GalleryPostContentProps) {
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
      <div className="overflow-hidden break-words">
        <GalleryImageGrid
          postSlug={postSlug}
          onStatusChange={setGalleryStatus}
        />

        {ready && showBodyArea ? (
          <div className={hasGallery ? 'mt-8' : ''}>
            <div className={hasGallery ? proseBorderedClass : galleryProseClass}>
              <MemberAwareBlockRender blocks={bodyBlocks} variant="gallery" postSlug={postSlug} />
            </div>
          </div>
        ) : null}

        {ready && !hasGallery && !showBody && !memberEnabled ? (
          <p className="py-6 text-center text-[13px] text-neutral-400">
            暂无内容
          </p>
        ) : null}
      </div>
    </MathJaxContext>
  )
}
