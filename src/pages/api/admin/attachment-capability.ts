import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'
import {
  fetchSiteImageCapability,
  type SiteImageCapability,
} from '@/src/lib/storage/mainStorage'

// ============================================================
// 存储基座 W4-3 · 附件能力门（后台只读，AttachmentManager 挂载时取）
// ------------------------------------------------------------
// - GET → { success, backend, attachmentsEnabled, maxAttachmentMB,
//           presignEnabled }
//   （附件跟随图床基座：attachmentsEnabled = 主站判定，上限现为 20MB；
//     W4-4b：presignEnabled 透传主站直传开关，缺省 false）；
// - 鉴权与 /api/admin/attachments 同一写法（路由内 verifyAdminRequest）；
// - 能力读取失败回 { success:true, attachmentsEnabled:true, degraded:true }
//   （fail-open：调用方按可用渲染，不因主站抖动锁死附件功能）；
// - no-store（能力随图床基座切换变化，不做客户端缓存）。
// ============================================================

type CapabilityResponse = {
  success: boolean
  backend?: SiteImageCapability['backend']
  attachmentsEnabled: boolean
  maxAttachmentMB?: number
  /** W4-4b：直传(presign)开关透传（缺省 false） */
  presignEnabled?: boolean
  degraded?: boolean
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CapabilityResponse>
) {
  res.setHeader('Cache-Control', 'no-store')

  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ success: false, attachmentsEnabled: true, error: '未授权' })
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ success: false, attachmentsEnabled: true, error: 'Method not allowed' })
  }

  const capability = await fetchSiteImageCapability()
  if (!capability) {
    // fail-open：能力未知按可用处理（degraded 标记供前端参考）
    return res.status(200).json({
      success: true,
      attachmentsEnabled: true,
      degraded: true,
      presignEnabled: false,
    })
  }

  return res.status(200).json({
    success: true,
    backend: capability.backend,
    attachmentsEnabled: capability.attachmentsEnabled,
    maxAttachmentMB: capability.maxAttachmentMB,
    presignEnabled: capability.presignEnabled === true,
  })
}
