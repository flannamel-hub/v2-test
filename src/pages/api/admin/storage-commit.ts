import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'
import { forwardMainStorageJsonPost } from '@/src/lib/storage/mainStorage'

// ============================================================
// 存储基座 W4-4b · 直传 commit 代理（浏览器 → 本路由 → 主站）
// ------------------------------------------------------------
// 安全模型：浏览器永远拿不到 MERCHANT_API_TOKEN；本路由服务端持
// Bearer + BLOG_SITE_ID 转发主站 /api/storage/upload-commit
// （鉴权写法照抄 /api/admin/attachments）。
//   POST { commitToken }
//        → 主站 { success, key, url, downloadUrl, size, already_committed? }
//
// - 站点身份由服务端注入：浏览器传入的 site_id 一律忽略；
// - 主站 status 与响应体原样透传（不改写错误码/文案）；
// - 网络异常/超时 → 502 upstream_unreachable。
// ============================================================

const MAX_BODY_BYTES = 64 * 1024

function readJsonBody(req: NextApiRequest): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('BODY_TOO_LARGE'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
        resolve(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        reject(new Error('INVALID_JSON'))
      }
    })
    req.on('error', reject)
  })
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store')

  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ success: false, error: '未授权' })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  let body: Record<string, unknown>
  try {
    body = await readJsonBody(req)
  } catch (error) {
    const message = (error as Error).message
    if (message === 'BODY_TOO_LARGE') return res.status(413).json({ success: false, error: '请求体过大' })
    return res.status(400).json({ success: false, error: '请求体必须是 JSON' })
  }

  const result = await forwardMainStorageJsonPost('/api/storage/upload-commit', body)
  if (!result.ok) {
    return res.status(502).json({
      success: false,
      error: 'upstream_unreachable',
      message: '存储服务暂时不可用，请稍后重试',
    })
  }

  res.setHeader('Content-Type', 'application/json')
  return res.status(result.status).send(result.text)
}
