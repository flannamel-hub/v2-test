import type { NextApiRequest, NextApiResponse } from 'next'
import {
  getPopupAdConfig,
  updatePopupAdConfig,
} from '@/src/lib/blog/popupAdSettings'

type PopupAdResponse = {
  success: boolean
  popupAd?: Awaited<ReturnType<typeof getPopupAdConfig>>
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PopupAdResponse>
) {
  try {
    if (req.method === 'GET') {
      const popupAd = await getPopupAdConfig()
      return res.status(200).json({ success: true, popupAd })
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
      const popupAd = await updatePopupAdConfig({
        enabled:
          typeof body.enabled === 'boolean' ? body.enabled : undefined,
        title: typeof body.title === 'string' ? body.title : undefined,
        content: typeof body.content === 'string' ? body.content : undefined,
        image: typeof body.image === 'string' ? body.image : undefined,
        buttonText:
          typeof body.buttonText === 'string' ? body.buttonText : undefined,
        buttonUrl:
          typeof body.buttonUrl === 'string' ? body.buttonUrl : undefined,
      })
      return res.status(200).json({ success: true, popupAd })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务端错误'
    return res.status(500).json({ success: false, error: message })
  }
}
