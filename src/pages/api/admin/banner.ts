import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'
import {
  getShopBannerConfig,
  updateShopBannerConfig,
} from '@/src/lib/blog/shopBannerSettings'
import {
  revalidateMany,
  resolveRevalidateOrigin,
} from '@/src/lib/blog/contentRevalidation'

// P18C43-D1: 保存后服务端同步 revalidate + 预热首页,响应时间会变长
export const config = {
  maxDuration: 60,
}

type BannerResponse = {
  success: boolean
  banner?: Awaited<ReturnType<typeof getShopBannerConfig>>
  /** 首页 ISR revalidate(含预热)是否全部成功;失败不影响保存结果 */
  revalidated?: boolean
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BannerResponse>
) {
  // P18-C4-1: Banner 为 BLOG 后台浏览器专用接口,路由内校验 Basic / internal_auth Cookie
  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ success: false, error: '未授权访问' })
  }

  try {
    if (req.method === 'GET') {
      const banner = await getShopBannerConfig()
      return res.status(200).json({ success: true, banner })
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
      const banner = await updateShopBannerConfig({
        enabled:
          typeof body.enabled === 'boolean' ? body.enabled : undefined,
        link: typeof body.link === 'string' ? body.link : undefined,
        images: Array.isArray(body.images)
          ? body.images.filter((item: unknown): item is string =>
              typeof item === 'string'
            )
          : undefined,
      })

      // P18C43-D1: Banner 仅 shop 首页渲染,保存成功后立即 revalidate '/'
      // 并预热(多轮 revalidate + 主动拉取),避免 3600s ISR 缓存导致
      // "开启了不显示";revalidate 失败不回滚保存结果,仅回执标记
      let revalidated = true
      try {
        const results = await revalidateMany(res, ['/'], {
          clearCaches: true,
          warmPaths: true,
          origin: resolveRevalidateOrigin(req),
        })
        revalidated = results.every((item) => item.ok)
      } catch (error) {
        console.warn(
          '[admin/banner] homepage revalidate failed:',
          error instanceof Error ? error.message : error
        )
        revalidated = false
      }

      return res.status(200).json({ success: true, banner, revalidated })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务端错误'
    return res.status(500).json({ success: false, error: message })
  }
}
