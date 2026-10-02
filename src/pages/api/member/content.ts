import type { NextApiRequest, NextApiResponse } from 'next'
import { getEffectiveMembershipConfig } from '@/src/lib/blog/membershipGate'
import {
  MEMBER_COOKIE_NAME,
  normalizeMemberHost,
  verifyMemberPassport,
} from '@/src/lib/blog/memberPassport'
import { splitBlocksOnMemberMarker } from '@/src/lib/blog/memberContent'
import {
  readMemberContentCache,
  writeMemberContentCache,
} from '@/src/lib/blog/memberContentCache'
import { formatBlocks } from '@/src/lib/blog/format/block'
import { getPostBySlug } from '@/src/lib/notion/getBlogData'
import { getAllBlocks } from '@/src/lib/notion/getBlocks'
import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { ApiScope } from '@/src/types/notion'

/**
 * 站点会员 B2:会员区内容 API。
 * GET /api/member/content?slug=xxx
 * - 纯本地验签(无中心调用);门控关 → 403;
 * - mexp 到期 / exp 过期均 401(本地硬判;验签 7d 宽限仅服务 session/refresh 流,
 *   不给本 API 放大时效——审阅 M4);
 * - 内容缓存 + ETag/304(If-None-Match 宽松比对,审阅 M5);304 服务于客户端
 *   应用层内存缓存流程,响应始终 no-store,不依赖浏览器 HTTP 缓存;
 * - 无会员区标记 → 200 {blocks:[]}(不报错);日志绝不包含 token 原文。
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ success: false, error: 'method_not_allowed' })
  }

  try {
    // 1. 门控:未开通/免费版 → 403(零后续动作)
    const config = await getEffectiveMembershipConfig()
    if (!config) {
      return res.status(403).json({ success: false, error: 'disabled' })
    }

    // 2. slug 参数
    const slugRaw = req.query?.slug
    const slug = typeof slugRaw === 'string' ? slugRaw.trim() : ''
    if (!slug || slug.length > 200) {
      return res.status(400).json({ success: false, error: 'bad_request' })
    }

    // 3. 会话(读 sm_session cookie,纯本地验签)
    const token =
      typeof req.cookies?.[MEMBER_COOKIE_NAME] === 'string'
        ? req.cookies[MEMBER_COOKIE_NAME]
        : null
    const host = normalizeMemberHost(
      String(req.headers['x-forwarded-host'] || req.headers.host || '')
    )
    const siteId = getBlogSiteIdOrNull()
    if (!token || !host || !siteId) {
      return res.status(401).json({ success: false, error: 'unauthorized' })
    }
    const verified = await verifyMemberPassport(token, { host, siteId })
    if (!verified.ok) {
      return res.status(401).json({ success: false, error: 'unauthorized' })
    }
    const claims = verified.claims
    const now = Math.floor(Date.now() / 1000)
    // 会员到期 → 401(到期不供内容)
    if (claims.mexp !== null && claims.mexp <= now) {
      return res.status(401).json({ success: false, error: 'unauthorized' })
    }
    // 通行证本体过期 → 401(本地硬判,不吃验签宽限)
    if (claims.exp <= now) {
      return res.status(401).json({ success: false, error: 'unauthorized' })
    }

    // 4. 内容:先查缓存;未命中拉 Notion(与文章页同 scope)→ format → 切分取会员区
    let entry = readMemberContentCache(siteId, slug)
    if (!entry) {
      const rawPost = await getPostBySlug(slug, ApiScope.Archive)
      if (!rawPost) {
        return res.status(404).json({ success: false, error: 'not_found' })
      }
      const blocks = await getAllBlocks(rawPost.id)
      const formatted = await formatBlocks(blocks)
      const { memberBlocks } = splitBlocksOnMemberMarker(formatted)
      entry = writeMemberContentCache(siteId, slug, memberBlocks)
    }

    // 5. ETag / 304(If-None-Match 宽松比对:按逗号拆分逐项 trim,
    //    引号形态/裸值任一命中即 304;W/ 前缀因带前缀不可能相等,视不匹配)
    const etag = entry.etag
    const etagQuoted = `"${etag}"`
    res.setHeader('ETag', etagQuoted)
    const ifNoneMatchRaw = req.headers['if-none-match']
    if (typeof ifNoneMatchRaw === 'string' && ifNoneMatchRaw) {
      const matched = ifNoneMatchRaw
        .split(',')
        .map((item) => item.trim())
        .some((item) => item === etagQuoted || (item !== '' && item === etag))
      if (matched) {
        return res.status(304).end()
      }
    }

    // 6. 响应(无标记时 blocks=[];公开区 blocks 绝不进入本响应)
    return res.status(200).json({ success: true, blocks: entry.blocks })
  } catch (error) {
    console.error(
      '[member/content] error:',
      error instanceof Error ? error.message : error
    )
    return res.status(500).json({ success: false, error: 'internal' })
  }
}
