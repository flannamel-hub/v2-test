import type { NextApiRequest, NextApiResponse } from 'next'
import {
  getClickAdConfig,
  updateClickAdConfig,
} from '@/src/lib/blog/clickAdSettings'

type ClickAdResponse = {
  success: boolean
  clickAd?: Awaited<ReturnType<typeof getClickAdConfig>>
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ClickAdResponse>
) {
  try {
    if (req.method === 'GET') {
      const clickAd = await getClickAdConfig()
      return res.status(200).json({ success: true, clickAd })
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
      const clickAd = await updateClickAdConfig({
        enabled:
          typeof body.enabled === 'boolean' ? body.enabled : undefined,
        title: typeof body.title === 'string' ? body.title : undefined,
        url: typeof body.url === 'string' ? body.url : undefined,
      })
      return res.status(200).json({ success: true, clickAd })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务端错误'
    return res.status(500).json({ success: false, error: message })
  }
}
