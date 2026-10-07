import type { NextApiRequest, NextApiResponse } from 'next'
import { getThemeSwitchQuotaStatus } from '@/src/lib/blog/themeSwitchQuota'
import { getPlatformThemeControls } from '@/src/lib/blog/platformThemeControls'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'

type ThemeCooldownResponse = {
  success: boolean
  quota?: {
    maxSwitches: number
    used: number
    remaining: number
    blocked: boolean
    windowStart: string | null
    windowEndsAt: string | null
    remainingMs: number
  }
  platform?: {
    limitEnabled: boolean
    disabledThemes: string[]
  }
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ThemeCooldownResponse>
) {
  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ success: false, error: '未授权' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const [quota, platform] = await Promise.all([
      getThemeSwitchQuotaStatus(),
      getPlatformThemeControls(),
    ])
    return res.status(200).json({ success: true, quota, platform })
  } catch (e) {
    const message = e instanceof Error ? e.message : '服务器错误'
    return res.status(500).json({ success: false, error: message })
  }
}
