import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'

// ============================================================
// 兰空图床 (Lsky Pro 2.x) 中转上传代理
// ------------------------------------------------------------
// 安全模型：浏览器永远拿不到 LSKY_TOKEN。
// 浏览器 → 本接口(服务端) → 兰空 /api/v1/upload → 返回图片URL
//
// 零新增依赖：利用 Node 18+ 原生的 fetch / FormData / Blob，
// 关闭 Next 默认 bodyParser，直接读取原始二进制流后再转发。
// ============================================================

// 关闭 Next 自带的 body 解析，改为手动读取原始二进制流
export const config = {
  api: {
    bodyParser: false,
  },
}

// 单文件大小上限（字节）。Gallery 大图库建议 50MB；可用 LSKY_MAX_UPLOAD_MB 覆盖
const MAX_UPLOAD_MB = Math.min(
  Math.max(parseInt(process.env.LSKY_MAX_UPLOAD_MB || '50', 10) || 50, 1),
  200
)
const MAX_SIZE = MAX_UPLOAD_MB * 1024 * 1024

// 兰空实例地址：优先读环境变量，未配置则回退到默认域名
const LSKY_BASE = (process.env.LSKY_URL || 'https://img.x1file.top').replace(/\/+$/, '')
const LSKY_UPLOAD_ENDPOINT = `${LSKY_BASE}/api/v1/upload`

// 把请求流完整读入 Buffer
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_SIZE) {
        reject(new Error('FILE_TOO_LARGE'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: '仅支持 POST 请求' })
  }

  // middleware 当前只实际保护 /admin 页面；上传代理必须自行二次鉴权。
  if (!verifyAdminRequest(req)) {
    return res.status(401).json({ success: false, error: '未授权' })
  }

  // 1. 校验 token 是否配置
  let token = process.env.LSKY_TOKEN || ''
  if (!token) {
    return res.status(500).json({
      success: false,
      error: '图片上传服务未配置，请联系管理员',
    })
  }
  // 容错：若变量里没带 "Bearer " 前缀，自动补上
  if (!/^bearer\s/i.test(token)) {
    token = `Bearer ${token}`
  }

  try {
    // 2. 读取浏览器发来的原始二进制数据
    const buffer = await readRawBody(req)
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ success: false, error: '未接收到文件数据' })
    }

    // 文件名与类型由前端通过自定义头传入（见前端约定）
    const rawName = req.headers['x-file-name']
      ? decodeURIComponent(req.headers['x-file-name'])
      : `upload-${Date.now()}.png`
    const contentType = req.headers['content-type'] || 'application/octet-stream'

    // 简单的类型白名单：只允许图片 / 视频
    if (!/^(image|video)\//i.test(contentType)) {
      return res.status(415).json({
        success: false,
        error: `不支持的文件类型: ${contentType}`,
      })
    }

    // 3. 用原生 FormData + Blob 重新打包，转发给兰空
    const blob = new Blob([buffer], { type: contentType })
    const form = new FormData()
    form.append('file', blob, rawName)

    const lskyRes = await fetch(LSKY_UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: token,
        Accept: 'application/json',
        // 注意：千万不要手动设置 Content-Type，
        // fetch 会自动为 FormData 生成带 boundary 的 multipart 头
      },
      body: form,
    })

    // 4. 解析兰空返回
    const text = await lskyRes.text()
    let data
    try {
      data = JSON.parse(text)
    } catch (e) {
      // 兰空返回了非 JSON（通常是网关错误页 / token 失效跳转登录页）
      return res.status(502).json({
        success: false,
        error: '图片上传服务返回异常，请稍后重试',
        raw: text.slice(0, 300),
      })
    }

    // Lsky Pro 2.x: { status: true, message, data: { links: { url, ... } } }
    if (!lskyRes.ok || data.status === false) {
      const lskyMsg = data.message || '上传失败'
      const sizeHint = /大小|size|limit|过大/i.test(lskyMsg)
        ? `（单张上限 ${MAX_UPLOAD_MB}MB，请压缩后重试）`
        : ''
      return res.status(lskyRes.status || 502).json({
        success: false,
        error: `${lskyMsg}${sizeHint}`,
        data,
      })
    }

    const url = data?.data?.links?.url || ''
    if (!url) {
      return res.status(502).json({
        success: false,
        error: '上传失败：未获取到图片地址',
        data,
      })
    }

    // 5. 回传给前端：归一化字段 + 全量数据（方便前端按需取用）
    return res.status(200).json({
      success: true,
      url,
      name: data?.data?.origin_name || rawName,
      mimetype: data?.data?.mimetype || contentType,
      links: data?.data?.links || {},
      data,
    })
  } catch (error) {
    if (error.message === 'FILE_TOO_LARGE') {
      return res.status(413).json({
        success: false,
        error: `文件过大，本站代理单文件上限 ${MAX_UPLOAD_MB}MB`,
      })
    }
    console.error('Upload Proxy Error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
}
