'use client'

import { MemberAwareBlockRender, useMemberContent } from '@/src/components/post/MemberAwareBlockRender'
import { BlockResponse } from '@/src/types/notion'
import {
  filterGalleryBodyBlocks,
  hasGalleryBodyContent,
} from '@/src/themes/gallery/galleryPostBlocks'
import { MathJaxContext } from 'better-react-mathjax'
import { StandardGalleryThumbRail } from './StandardGalleryThumbRail'
import { useStandardGalleryPreview } from './StandardGalleryPreviewContext'

type StandardPostContentProps = {
  postSlug: string
  blocks: BlockResponse[]
}

export function StandardPostContent({
  postSlug,
  blocks,
}: StandardPostContentProps) {
  const ctx = useStandardGalleryPreview()
  const ready = ctx?.ready ?? false
  const hasGallery = ctx?.hasGallery ?? false

  const bodyBlocks = filterGalleryBodyBlocks(blocks, hasGallery)
  const showBody = hasGalleryBodyContent(blocks, hasGallery)
  // 站点会员 B2:纯会员文(marker 在首块,公开区为空)时正文区仍需渲染(gate 占位正文位)
  const memberEnabled = !!useMemberContent()?.enabled
  const showBodyArea = showBody || memberEnabled

  return (
    <MathJaxContext>
      <div className="standard-post-content overflow-hidden break-words">
        {hasGallery && ready ? (
          <>
            <StandardGalleryThumbRail />
            <div className="standard-gallery-preview__divider" role="presentation" />
          </>
        ) : null}

        {ready && showBodyArea ? (
          <div className={hasGallery ? 'standard-post-content__body' : ''}>
            <MemberAwareBlockRender blocks={bodyBlocks} variant="default" postSlug={postSlug} />
          </div>
        ) : null}

        {ready && !hasGallery && !showBody && !memberEnabled ? (
          <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            暂无内容
          </p>
        ) : null}
      </div>
    </MathJaxContext>
  )
}
