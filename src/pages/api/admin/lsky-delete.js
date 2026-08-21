import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'
import { getLskyAuthorization, isValidLskyFileKey } from '@/src/lib/admin/lskyServer'
import { getImageHostConfig } from '@/src/lib/media/imageHostConfig'

// ============================================================
// Phase6 图床孤立文件治理 —— 删除 API（服务端代理）
// ------------------------------------------------------------
// POST /api/admin/lsky-delete   body: { keys: string[] }
// - keys 必须全部匹配 /^[A-Za-z0-9_-]{1,64}$/（防注入路径）
// - 服务端逐条 DELETE {base}/api/v1/images/{key}，浏览器不接触凭据
// - 注意：兰空对不存在的 key 也返回成功（幂等），调用方（后台回收站）
//   必须先经扫描确认，再延迟 7 天后才可触发本接口
// 安全：middleware 不实际保护 /api/admin/*，路由内自行校验管理员会话。
// ============================================================

const MAX_KEYS_PER_REQUEST = 500

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: '仅支持 POST 请求' })
  }

  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ success: false, error: '未授权' })
  }

  const keys = req.body && req.body.keys
  if (!Array.isArray(keys) || keys.length === 0) {
    return res.status(400).json({ success: false, error: '缺少待清理文件' })
  }
  if (keys.length > MAX_KEYS_PER_REQUEST) {
    return res.status(400).json({
      success: false,
      error: `单次最多清理 ${MAX_KEYS_PER_REQUEST} 个文件`,
    })
  }
  if (!keys.every((key) => isValidLskyFileKey(key))) {
    return res.status(400).json({ success: false, error: '包含非法文件标识' })
  }

  const authorization = getLskyAuthorization()
  if (!authorization) {
    return res
      .status(500)
      .json({ success: false, error: '存储服务尚未配置，请联系管理员' })
  }

  try {
    const imageHostConfig = await getImageHostConfig()
    const base = imageHostConfig.uploadApiOrigin.replace(/\/+$/, '')

    const results = []
    for (const key of keys) {
      try {
        const lskyRes = await fetch(`${base}/api/v1/images/${encodeURIComponent(key)}`, {
          method: 'DELETE',
          headers: { Authorization: authorization, Accept: 'application/json' },
        })
        const text = await lskyRes.text()
        let json = null
        try {
          json = JSON.parse(text)
        } catch (_) {
          json = null
        }
        const ok = lskyRes.ok && Boolean(json) && json.status !== false
        results.push({
          key,
          ok,
          message: (json && json.message) || (ok ? '' : `HTTP ${lskyRes.status}`),
        })
      } catch (error) {
        results.push({ key, ok: false, message: '网络异常，请稍后重试' })
      }
    }

    return res.status(200).json({ success: true, results })
  } catch (error) {
    console.error(
      '[lsky-delete] 清理失败：',
      error instanceof Error ? error.message : error
    )
    return res
      .status(502)
      .json({ success: false, error: '清理失败，请稍后重试' })
  }
}
