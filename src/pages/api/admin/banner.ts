import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'
import {
  getShopBannerConfig,
  updateShopBannerConfig,
} from '@/src/lib/blog/shopBannerSettings'

type BannerResponse = {
  success: boolean
  banner?: Awaited<ReturnType<typeof getShopBannerConfig>>
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
      return res.status(200).json({ success: true, banner })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务端错误'
    return res.status(500).json({ success: false, error: message })
  }
}
