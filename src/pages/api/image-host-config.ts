import { getImageHostConfig } from '@/src/lib/media/imageHostConfig'
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const config = await getImageHostConfig()
  res.setHeader(
    'Cache-Control',
    'private, no-store, no-cache, must-revalidate, max-age=0'
  )
  return res.status(200).json({
    success: true,
    version: config.version,
    public_asset_origin: config.publicAssetOrigin,
    legacy_asset_origins: config.legacyAssetOrigins,
  })
}
