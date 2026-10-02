import { formatBlocks } from '@/src/lib/blog/format/block'
import {
  mintArticleUnlockToken,
  readStoredArticlePassword,
  verifyArticleUnlockTokenForPage,
} from '@/src/lib/blog/articlePasswordToken'
import { splitBlocksOnMemberMarker } from '@/src/lib/blog/memberContent'
import { getPostBySlug } from '@/src/lib/notion/getBlogData'
import { getAllBlocks } from '@/src/lib/notion/getBlocks'
import { ApiScope } from '@/src/types/notion'
import type { NextApiRequest, NextApiResponse } from 'next'

async function loadPostBlocks(pageId: string) {
  const blocks = await getAllBlocks(pageId)
  return formatBlocks(blocks)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const slug = String(body?.slug || '').trim()
    const password = String(body?.password ?? '')
    const token = body?.token != null ? String(body.token) : ''

    if (!slug) {
      return res.status(400).json({ success: false, error: '缺少 slug' })
    }

    const rawPost = await getPostBySlug(slug, ApiScope.Archive)
    if (!rawPost) {
      return res.status(404).json({ success: false, error: '文章不存在' })
    }

    const storedPassword = readStoredArticlePassword(rawPost.properties)
    if (!storedPassword) {
      return res.status(400).json({ success: false, error: '该文章未设置访问密码' })
    }

    let authorized = false
    if (token) {
      authorized = verifyArticleUnlockTokenForPage(slug, rawPost.properties, token)
    } else if (password.trim() === storedPassword) {
      authorized = true
    }

    if (!authorized) {
      return res.status(401).json({ success: false, error: '密码错误' })
    }

    const blocks = await loadPostBlocks(rawPost.id)
    // 站点会员 B2(P0):全篇密码通道不得泄露会员区——返回前切分,只返回公开区
    const { publicBlocks } = splitBlocksOnMemberMarker(blocks)
    const unlockToken = mintArticleUnlockToken(slug, storedPassword)

    return res.status(200).json({
      success: true,
      token: unlockToken,
      blocks: publicBlocks,
    })
  } catch (error) {
    console.error('[api/post/unlock]', error)
    const message = error instanceof Error ? error.message : '解锁失败'
    return res.status(500).json({ success: false, error: message })
  }
}
