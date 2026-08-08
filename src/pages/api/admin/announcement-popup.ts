import type { NextApiRequest, NextApiResponse } from 'next'
import {
  getAnnouncementPopupConfig,
  updateAnnouncementPopupConfig,
} from '@/src/lib/blog/announcementPopupSettings'

type AnnouncementPopupResponse = {
  success: boolean
  popup?: Awaited<ReturnType<typeof getAnnouncementPopupConfig>>
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AnnouncementPopupResponse>
) {
  try {
    if (req.method === 'GET') {
      const popup = await getAnnouncementPopupConfig()
      return res.status(200).json({ success: true, popup })
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
      const popup = await updateAnnouncementPopupConfig({
        enabled:
          typeof body.enabled === 'boolean' ? body.enabled : undefined,
        title: typeof body.title === 'string' ? body.title : undefined,
        content: typeof body.content === 'string' ? body.content : undefined,
        image: typeof body.image === 'string' ? body.image : undefined,
        // 公告仅通知：忽略客户端传入的按钮字段，保存时统一清空
        buttonText: '',
        buttonUrl: '',
      })
      return res.status(200).json({ success: true, popup })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务端错误'
    return res.status(500).json({ success: false, error: message })
  }
}
