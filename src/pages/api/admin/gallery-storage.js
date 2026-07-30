import { isGalleryTenantConfigured } from '@/src/lib/gallery/blogSite'
import {
  canAddGalleryPendingBytes,
  formatGalleryStorageBytes,
  getGalleryQuotaBytes,
  getGalleryStorageStats,
} from '@/src/lib/gallery/galleryStorage'

export default async function handler(req, res) {
  if (!isGalleryTenantConfigured()) {
    return res.status(503).json({
      success: false,
      configured: false,
      error: '图库容量统计暂未启用。',
    })
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ success: false, error: '不支持的请求方法' })
  }

  try {
    const pendingBytes = Math.max(
      0,
      parseInt(String(req.query.pendingBytes || '0'), 10) || 0
    )

    const stats = await getGalleryStorageStats()
    const check =
      pendingBytes > 0 ? await canAddGalleryPendingBytes(pendingBytes) : null

    return res.status(200).json({
      success: true,
      configured: true,
      ...stats,
      quotaLabel: formatGalleryStorageBytes(getGalleryQuotaBytes()),
      usedLabel: formatGalleryStorageBytes(stats.usedBytes),
      remainingLabel: formatGalleryStorageBytes(stats.remainingBytes),
      canUpload: check ? check.ok : stats.remainingBytes > 0,
      pendingBytes,
      quotaMessage: check && !check.ok ? check.message : undefined,
    })
  } catch (e) {
    console.error('/api/admin/gallery-storage', e)
    return res.status(500).json({
      success: false,
      error: e?.message || '读取图库容量失败',
    })
  }
}
