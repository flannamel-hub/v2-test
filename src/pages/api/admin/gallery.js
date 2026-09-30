import { isGalleryTenantConfigured } from '@/src/lib/gallery/blogSite'
import { getGalleryFeatureEnabled } from '@/src/lib/blog/galleryFeatureGate'
import {
  listAllGalleryImagesForAdmin,
  syncGalleryImages,
} from '@/src/lib/gallery/galleryDb'

export default async function handler(req, res) {
  if (!isGalleryTenantConfigured()) {
    return res.status(503).json({
      success: false,
      error:
        '图库服务暂未启用，请联系管理员。',
    })
  }

  // 图库基座手术 批1:站点级图库开关(fail-closed)关闭时本管理 API 整体 503;
  // 公开读 /api/gallery/[slug] 与 /api/gallery/post-stats 不设此门控
  // (按方案 §3.7:公开读零回归)
  const galleryEnabled = await getGalleryFeatureEnabled()
  if (!galleryEnabled) {
    return res.status(503).json({ success: false, error: '图库功能未启用' })
  }

  try {
    if (req.method === 'GET') {
      const slug = String(req.query.slug || '').trim()
      if (!slug) {
        return res.status(400).json({ success: false, error: '缺少 slug' })
      }
      const data = await listAllGalleryImagesForAdmin(slug)
      return res.status(200).json({ success: true, ...data })
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const slug = String(body.postSlug || body.slug || '').trim()
      if (!slug) {
        return res.status(400).json({ success: false, error: '缺少 postSlug' })
      }
      const images = Array.isArray(body.images) ? body.images : []
      const result = await syncGalleryImages({
        postSlug: slug,
        postNotionId: body.postNotionId || body.notionId || null,
        title: body.title || null,
        images: images.map((img) => ({
          url: typeof img === 'string' ? img : img?.url,
          thumb_url:
            typeof img === 'object' && img?.thumb_url ? img.thumb_url : undefined,
          file_size:
            typeof img === 'object' && img?.file_size != null
              ? Number(img.file_size)
              : undefined,
        })),
      })
      return res.status(200).json({ success: true, ...result })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ success: false, error: '不支持的请求方法' })
  } catch (e) {
    console.error('/api/admin/gallery', e)
    const status = e?.name === 'GalleryStorageQuotaError' ? 413 : 500
    return res.status(status).json({
      success: false,
      error: e?.message || '图库操作失败',
    })
  }
}
