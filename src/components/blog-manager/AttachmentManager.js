import { useCallback, useEffect, useRef, useState } from 'react'

// ============================================================
// 存储基座 S3 · 文章「附件」管理（编辑器 Step 区块）
// ------------------------------------------------------------
// - 上传/列表/删除全部经 /api/admin/attachments（本站服务端代理
//   → 主站存储 API；浏览器不接触 MERCHANT_API_TOKEN）；
// - 附件立即上传（不随「保存」延迟）——按文章 slug（post_key）挂载，
//   新建文章的 slug 在创建时已自动生成，无空窗；
// - 删除=主站软删（幂等）；列表自动刷新；
// - 视觉对齐 BLOG 后台暗色系（无 emoji 灰阶）；
// - BLOG-UI-FIX：按用户要求移除「空间容量」用量条与「暂无附件」「附件与本文绑定」
//   说明文案，格式提示只留单文件上限一行；usage 查询保留（仅用于冻结/满载
//   上传前置预检，不再渲染容量 UI）；
// - BLOG-UI-FIX：上传改 XHR（upload.onprogress），转圈改为百分比进度条（0-100%）。
// - W4-3：附件能力门——挂载时取 /api/admin/attachment-capability，
//   attachmentsEnabled=false 整块灰显不可用（文案「当前图床基座不支持附件」），
//   请求失败按可用渲染（fail-open）；单文件上限随能力值动态显示（默认 20MB）。
// - W4-4b：直传优先——能力允许（storage_base + presignEnabled）时
//   ticket → XHR PUT（带进度）→ commit；失败 ≤4MB 无感回退代理通道，
//   >4MB 明确报错；错误文案走同一 error 状态，既有 UI 语义不变。
// ============================================================

const ATTACHMENT_EXT_RE = /\.(pdf|zip|rar|7z|doc|docx|xls|xlsx|txt)$/i
// W4-3：附件单文件上限 50MB → 20MB（能力接口未返回上限时的兜底常量）
export const MAX_UPLOAD_MB = 20

// W4-3：附件能力门纯判定（null/未知 = fail-open 按可用；仅显式 false 判不可用）
export function resolveAttachmentAvailability(capability) {
  if (!capability) return true
  return capability.attachmentsEnabled !== false
}

// W4-4b：直传失败时允许回退代理通道的文件体积上限（超过则回退无意义，直接报错）
const DIRECT_FALLBACK_SAFE_BYTES = 4 * 1024 * 1024

function formatBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0)
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

function formatTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return ''
  }
}

// BLOG-UI-FIX：fetch 无法获取上传进度，改用 XHR（upload.onprogress 回调 0-100）
// W4-4b：原代理实现保留为 uploadAttachmentViaProxy（回退通道，逻辑不变）
function uploadAttachmentViaProxy({ file, slug, onPercent }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(
      'POST',
      `/api/admin/attachments?slug=${encodeURIComponent(slug)}`,
      true
    )
    xhr.withCredentials = true
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name || 'attachment'))
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onPercent(Math.min(100, Math.round((e.loaded / e.total) * 100)))
      }
    }
    xhr.onload = () => {
      let d = null
      try {
        d = JSON.parse(xhr.responseText || '')
      } catch {
        d = null
      }
      if (xhr.status >= 200 && xhr.status < 300 && d && d.success) {
        resolve(d)
      } else {
        reject(new Error((d && d.error) || `上传失败：${file.name}`))
      }
    }
    xhr.onerror = () => reject(new Error(`上传失败：${file.name}（网络错误）`))
    xhr.onabort = () => reject(new Error(`已取消上传：${file.name}`))
    xhr.ontimeout = () => reject(new Error(`上传超时：${file.name}`))
    xhr.send(file)
  })
}

// W4-4b 直传（presign）：ticket → XHR PUT（带进度）→ commit
function requestDirectTicket(params) {
  return fetch('/api/admin/storage-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(params),
  }).then(async (r) => {
    const d = await r.json().catch(() => null)
    if (!r.ok || !d || d.success === false) {
      const error = new Error((d && d.message) || `直传请求失败：HTTP ${r.status}`)
      error.code = (d && d.error) || ''
      throw error
    }
    return d
  })
}

function commitDirectUpload(commitToken) {
  return fetch('/api/admin/storage-commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ commitToken }),
  }).then(async (r) => {
    const d = await r.json().catch(() => null)
    if (!r.ok || !d || d.success === false) {
      const error = new Error((d && d.message) || `登记请求失败：HTTP ${r.status}`)
      error.code = (d && d.error) || ''
      throw error
    }
    return d
  })
}

function xhrPutFileToPresignedUrl(putUrl, file, headers, onPercent) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', putUrl, true)
    const entries = Object.entries(headers || {})
    for (const [name, value] of entries) {
      xhr.setRequestHeader(name, value)
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        onPercent(Math.min(100, Math.round((e.loaded / e.total) * 100)))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`直传写入失败：HTTP ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('直传写入失败（网络错误）'))
    xhr.onabort = () => reject(new Error('直传写入已取消'))
    xhr.ontimeout = () => reject(new Error('直传写入超时'))
    xhr.send(file)
  })
}

async function uploadAttachmentDirect({ file, slug, onPercent }) {
  let everPutOk = false
  let lastError = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const ticket = await requestDirectTicket({
        type: 'attachment',
        postKey: slug,
        filename: file.name || 'attachment',
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      })
      if (!ticket.putUrl || !ticket.commitToken) {
        throw new Error('直传凭据不完整')
      }
      await xhrPutFileToPresignedUrl(ticket.putUrl, file, ticket.requiredHeaders, onPercent)
      everPutOk = true
      await commitDirectUpload(ticket.commitToken)
      return
    } catch (e) {
      lastError = e
    }
  }

  if (everPutOk) {
    // 文件已写入但登记两次都失败：不得静默成功，也不得换道重传
    const error = new Error('文件已上传但未保存成功，请重试')
    error.commitFailedNoFallback = true
    throw error
  }
  throw lastError
}

// W4-4b：直传优先 + 自动回退（能力关闭/读取失败/非 storage_base → 代理，零行为变化；
// 直传失败 ≤4MB 无感回退 /api/admin/attachments；>4MB 明确报错）
export async function uploadAttachmentWithProgress({ file, slug, onPercent, directEnabled }) {
  if (directEnabled) {
    try {
      return await uploadAttachmentDirect({ file, slug, onPercent })
    } catch (e) {
      if (e && e.commitFailedNoFallback) throw e
      if (file.size > DIRECT_FALLBACK_SAFE_BYTES) {
        throw new Error('上传失败，请检查网络后重试')
      }
      // ≤4MB：回退既有代理通道（无感）
    }
  }
  return uploadAttachmentViaProxy({ file, slug, onPercent })
}

export function AttachmentManager({ postSlug }) {
  const slug = (postSlug || '').trim()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0, percent: 0 })
  const [deletingKey, setDeletingKey] = useState('')
  const [error, setError] = useState('')
  // S3FIX：创作者存储用量（null=加载中或查询失败，降级显示「—」不阻断）
  // S4-3：quotaBytes 透传（无值时存 null，展示回退「—」）；frozen 透传冻结态
  const [usage, setUsage] = useState(null)
  // W4-3：附件能力门（null=加载中或查询失败 → fail-open 按可用渲染）
  const [capability, setCapability] = useState(null)
  const fileInputRef = useRef(null)

  // W4-3：挂载时取附件能力（附件跟随图床基座）；失败按可用（fail-open）
  // W4-4b：同时透传 backend/presignEnabled 供直传判定
  const loadCapability = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/attachment-capability', { credentials: 'same-origin' })
      const d = await r.json().catch(() => null)
      if (r.ok && d && d.success && typeof d.attachmentsEnabled === 'boolean') {
        const mb = Math.floor(Number(d.maxAttachmentMB))
        setCapability({
          attachmentsEnabled: d.attachmentsEnabled,
          maxAttachmentMB: Number.isFinite(mb) && mb > 0 ? mb : MAX_UPLOAD_MB,
          backend: typeof d.backend === 'string' ? d.backend : '',
          presignEnabled: d.presignEnabled === true,
        })
      } else {
        setCapability(null)
      }
    } catch {
      setCapability(null)
    }
  }, [])

  useEffect(() => {
    loadCapability()
  }, [loadCapability])

  const loadUsage = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/storage-usage', { credentials: 'same-origin' })
      const d = await r.json().catch(() => null)
      if (r.ok && d && d.success && typeof d.usedBytes === 'number') {
        setUsage({
          usedBytes: d.usedBytes,
          quotaBytes: typeof d.quotaBytes === 'number' ? d.quotaBytes : null,
          usedPct: Number(d.usedPct) || 0,
          filesCount: Number(d.filesCount) || 0,
          frozen: d.frozen === true,
          // Q-FIX：创作者级合并容量口径（含名下图库+B2 空间；null=未计算，降级 B2 口径展示）
          storagePct: typeof d.storagePct === 'number' ? Number(d.storagePct) : null,
          storageStatus:
            d.storageStatus === 'warning' || d.storageStatus === 'full'
              ? d.storageStatus
              : 'normal',
        })
      } else {
        setUsage(null)
      }
    } catch {
      setUsage(null)
    }
  }, [])

  useEffect(() => {
    loadUsage()
  }, [loadUsage])

  const loadList = useCallback(async () => {
    if (!slug) {
      setItems([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const r = await fetch(`/api/admin/attachments?slug=${encodeURIComponent(slug)}`)
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || '附件列表加载失败')
      setItems(d.items || [])
    } catch (e) {
      setError(e.message || '附件列表加载失败')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    loadList()
  }, [loadList])

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length === 0) return
    if (!attachmentsAvailable) {
      setError('当前图床基座不支持附件')
      return
    }
    if (!slug) {
      setError('文章尚未初始化，请先填写标题后再上传附件')
      return
    }
    // S4-3：冻结前置提示（账号级冻结只禁上传；后端 403 兜底，此处仅前端双保险）
    if (usage && usage.frozen) {
      setError('空间已冻结，请联系平台')
      return
    }

    const invalid = files.find((f) => !ATTACHMENT_EXT_RE.test(f.name || ''))
    if (invalid) {
      setError(`不支持的附件格式：${invalid.name}（仅 pdf / zip / rar / 7z / doc / docx / xls / xlsx / txt）`)
      return
    }
    // W4-3：上限随能力值（默认 20MB）
    const tooLarge = files.find((f) => f.size > maxUploadMb * 1024 * 1024)
    if (tooLarge) {
      setError(`附件过大：${tooLarge.name}（单文件上限 ${maxUploadMb}MB）`)
      return
    }
    // 乐观预检：已满即提示（后端配额仍强制，此处仅前端双保险；
    // S4-3：配额随 quotaBytes 参数化，无值时不带容量数字）
    if (usage && Number(usage.usedPct) >= 100) {
      const quotaText = usage.quotaBytes ? `（${formatBytes(usage.quotaBytes)}）` : ''
      setError(`存储空间已满${quotaText}，请删除部分文件后再上传`)
      return
    }

    setUploading(true)
    setError('')
    setUploadProgress({ done: 0, total: files.length, percent: 0 })
    // W4-4b：直传能力派生（backend=storage_base 且 presignEnabled；能力未知=按代理）
    const directEnabled = !!(
      capability &&
      capability.backend === 'storage_base' &&
      capability.presignEnabled === true
    )
    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]
        // 整体进度 = 已完成文件数 + 当前文件进度；服务器响应前封顶 99%，响应后记满
        await uploadAttachmentWithProgress({
          file,
          slug,
          onPercent: (pct) => {
            const overall = Math.min(
              99,
              Math.round(((i + pct / 100) / files.length) * 100)
            )
            setUploadProgress({ done: i, total: files.length, percent: overall })
          },
          directEnabled,
        })
        setUploadProgress({
          done: i + 1,
          total: files.length,
          percent: Math.round(((i + 1) / files.length) * 100),
        })
      }
      await loadList()
    } catch (e) {
      setError(e.message || '附件上传失败')
      await loadList()
    } finally {
      setUploading(false)
      loadUsage()
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`确认删除附件「${item.original_name || item.key}」？删除后文章页将不再显示。`)) {
      return
    }
    setDeletingKey(item.key)
    setError('')
    try {
      const r = await fetch('/api/admin/attachments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: item.key }),
        credentials: 'same-origin',
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.success) throw new Error(d.error || '删除失败')
      setItems((prev) => prev.filter((it) => it.key !== item.key))
      loadUsage()
    } catch (e) {
      setError(e.message || '删除失败')
    } finally {
      setDeletingKey('')
    }
  }

  // S4-3：冻结态派生（usage 为 null=查询失败/加载中时按未冻结，后端 403 兜底）
  const frozen = !!(usage && usage.frozen)
  // W4-3：附件能力门派生（capability=null → fail-open 按可用）
  const attachmentsAvailable = resolveAttachmentAvailability(capability)
  const maxUploadMb =
    capability && Number(capability.maxAttachmentMB) > 0
      ? Math.floor(Number(capability.maxAttachmentMB))
      : MAX_UPLOAD_MB
  const uploadDisabled = uploading || !slug || frozen || !attachmentsAvailable

  return (
    <div style={{ opacity: attachmentsAvailable ? 1 : 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <button
          type="button"
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          disabled={uploadDisabled}
          style={{
            height: '34px',
            padding: '0 16px',
            borderRadius: '8px',
            cursor: uploadDisabled ? 'not-allowed' : 'pointer',
            border: '1px solid rgba(173,255,47,0.45)',
            background: uploadDisabled ? '#2a2a2e' : '#303030',
            color: uploadDisabled ? '#777' : 'greenyellow',
            fontSize: '12px',
            fontWeight: 'bold',
            opacity: uploadDisabled ? 0.7 : 1,
          }}
        >
          上传附件
        </button>
        <span style={{ fontSize: '11px', color: frozen ? '#ff6b6b' : '#777', lineHeight: 1.5 }}>
          {!attachmentsAvailable
            ? '当前图床基座不支持附件'
            : frozen
              ? '空间已冻结，请联系平台'
              : uploading
                ? `正在上传 ${uploadProgress.percent}%…`
                : `单文件 ≤ ${maxUploadMb}MB`}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt"
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
      </div>

      {uploading ? (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid #3a3a42',
            background: '#1b1b20',
            marginBottom: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              marginBottom: '6px',
            }}
          >
            <span style={{ fontSize: '12px', color: '#bbb' }}>
              正在上传附件（{Math.min(uploadProgress.done + 1, uploadProgress.total)}/{uploadProgress.total}），请勿关闭页面
            </span>
            <span
              data-testid="attachment-upload-percent"
              style={{
                fontSize: '12px',
                color: '#ddd',
                fontWeight: 'bold',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {uploadProgress.percent}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={uploadProgress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              height: '4px',
              borderRadius: '2px',
              background: '#2a2a30',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${uploadProgress.percent}%`,
                height: '100%',
                background: '#8a8a92',
                borderRadius: '2px',
                transition: 'width 0.2s ease-out',
              }}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p style={{ fontSize: '11px', color: '#ff6b6b', margin: '0 0 8px', lineHeight: 1.5, wordBreak: 'break-all' }}>
          {error}
        </p>
      ) : null}

      {/* W4-3：能力不可用时列表区不渲染（整块灰显不可用态） */}
      {!attachmentsAvailable ? null : loading ? (
        <p style={{ fontSize: '11px', color: '#777', margin: '0 0 8px' }}>附件列表加载中…</p>
      ) : items.length === 0 ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {items.map((item) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #333',
                background: '#18181c',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    fontSize: '12px',
                    color: '#e5e5e5',
                    margin: 0,
                    lineHeight: 1.5,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={item.original_name || item.key}
                >
                  {item.original_name || item.key}
                </p>
                <p style={{ fontSize: '10px', color: '#777', margin: '2px 0 0', lineHeight: 1.4 }}>
                  {formatBytes(item.size)}
                  {item.created_at ? ` · ${formatTime(item.created_at)}` : ''}
                </p>
              </div>
              <a
                href={item.download_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flexShrink: 0,
                  height: '28px',
                  lineHeight: '28px',
                  padding: '0 12px',
                  borderRadius: '7px',
                  border: '1px solid #444',
                  color: '#ccc',
                  fontSize: '11px',
                  textDecoration: 'none',
                }}
              >
                下载附件
              </a>
              <button
                type="button"
                onClick={() => handleDelete(item)}
                disabled={deletingKey === item.key}
                style={{
                  flexShrink: 0,
                  height: '28px',
                  padding: '0 12px',
                  borderRadius: '7px',
                  cursor: deletingKey === item.key ? 'wait' : 'pointer',
                  border: '1px solid rgba(239,68,68,0.6)',
                  background: deletingKey === item.key ? '#2a1a1a' : 'rgba(239,68,68,0.12)',
                  color: '#f87171',
                  fontSize: '11px',
                }}
              >
                {deletingKey === item.key ? '删除中…' : '删除'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default AttachmentManager
