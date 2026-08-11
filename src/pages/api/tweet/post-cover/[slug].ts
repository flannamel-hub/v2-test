import {
  isDefaultPostCover,
  resolveBodyCoverUrl,
} from '@/src/lib/gallery/postCover'
import { getAllBlocks } from '@/src/lib/notion/getBlocks'
import { getPostBySlug } from '@/src/lib/notion/getBlogData'
import { readCoverFromPageProperties } from '@/src/lib/notion/readProperty'
import { getImageHostConfig } from '@/src/lib/media/imageHostConfig'
import { ApiScope } from '@/src/types/notion'
import type { NextApiRequest, NextApiResponse } from 'next'

type PostCoverResponse = {
  success: boolean
  url?: string
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostCoverResponse>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ success: false, error: '仅支持 GET' })
  }

  await getImageHostConfig()

  const slug = String(req.query.slug || '').trim()
  if (!slug) {
    return res.status(400).json({ success: false, error: '缺少 slug' })
  }

  try {
    const rawPost = await getPostBySlug(slug, ApiScope.Archive)
    if (!rawPost) {
      return res.status(404).json({ success: false, error: '文章不存在' })
    }

    const coverFromProp = readCoverFromPageProperties(
      rawPost.properties as Record<string, { type?: string }>
    )
    const useDefaultCover = isDefaultPostCover(coverFromProp)
    const blocks = await getAllBlocks(rawPost.id)
    const url = resolveBodyCoverUrl(coverFromProp, blocks, { useDefaultCover })
    const safeUrl =
      url && (!isDefaultPostCover(url) || useDefaultCover) ? url : undefined

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400'
    )
    return res.status(200).json({ success: true, url: safeUrl })
  } catch (e) {
    console.error('GET /api/tweet/post-cover/[slug]', slug, e)
    return res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : '读取封面失败',
    })
  }
}
