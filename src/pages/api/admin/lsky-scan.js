import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'
import { getLskyAuthorization } from '@/src/lib/admin/lskyServer'
import { getImageHostConfig } from '@/src/lib/media/imageHostConfig'
import {
  fetchAllLskyImages,
  collectAllReferenceUrls,
  buildReferenceIndex,
  detectOrphanFiles,
} from '@/src/lib/admin/lskyOrphanScan'

// ============================================================
// Phase6 图床孤立文件治理 —— 扫描 API（只读，绝不删除）
// ------------------------------------------------------------
// GET /api/admin/lsky-scan
// 1. 分页拉取兰空全量文件（per_page=100）
// 2. 构建引用集：Notion 全库（cover/属性/blocks/子库）+ Supabase 图库
//    + 爬虫待入库队列；URL 归一化为 pathname 比对
// 3. 孤立判定（保守：无法确认的一律视为被引用）
// 4. 返回 { success, total, totalSizeKB, orphanCount, orphanSizeKB,
//          orphans(≤2000), truncated }
// 安全：middleware 不实际保护 /api/admin/*，路由内自行校验管理员会话。
// ============================================================

const MAX_ORPHANS_RETURNED = 2000

// Vercel 函数超时上限（Hobby 60s）：大库全量扫描约 3-4 分钟，线上可能超时，
// 完整扫描建议本地/低峰运行；超时后面板会提示重试。
export const maxDuration = 60

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ success: false, error: '仅支持 GET 请求' })
  }

  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ success: false, error: '未授权' })
  }

  const authorization = getLskyAuthorization()
  if (!authorization) {
    return res
      .status(500)
      .json({ success: false, error: '存储服务尚未配置，请联系管理员' })
  }

  try {
    const imageHostConfig = await getImageHostConfig()

    const images = await fetchAllLskyImages(
      imageHostConfig.uploadApiOrigin,
      authorization
    )

    const { notionUrls, galleryUrls, crawlerUrls } =
      await collectAllReferenceUrls()
    const referenceIndex = buildReferenceIndex([
      ...notionUrls,
      ...galleryUrls,
      ...crawlerUrls,
    ])

    const orphans = detectOrphanFiles(
      images,
      referenceIndex,
      imageHostConfig.publicAssetOrigin
    )

    const totalSizeKB = images.reduce((sum, image) => sum + image.size, 0)
    const orphanSizeKB = orphans.reduce((sum, image) => sum + image.size, 0)
    const truncated = orphans.length > MAX_ORPHANS_RETURNED

    return res.status(200).json({
      success: true,
      total: images.length,
      totalSizeKB,
      orphanCount: orphans.length,
      orphanSizeKB,
      truncated,
      orphans: orphans.slice(0, MAX_ORPHANS_RETURNED),
    })
  } catch (error) {
    console.error(
      '[lsky-scan] 扫描失败：',
      error instanceof Error ? error.message : error
    )
    return res.status(502).json({
      success: false,
      error:
        error instanceof Error && error.message
          ? error.message.slice(0, 160)
          : '扫描失败，请稍后重试',
    })
  }
}
