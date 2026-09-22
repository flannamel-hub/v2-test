/**
 * 存储基座 S3:主站存储 API fetch 封装(图片双轨判定 + 附件列表/上传/删除)。
 *
 * 约定(与 src/lib/shop/merchantProducts.ts 同源):
 * - MERCHANT_API_BASE = 主站 origin(不带 /api 前缀,尾斜杠剥离;缺省回退主站正式域名);
 * - 路径一律以 / 开头拼在 base 后;MERCHANT_API_TOKEN 仅服务端使用,绝不回传浏览器;
 * - BLOG 站身份 = BLOG_SITE_ID(merchant_services.id),缺失时一律按 legacy 降级;
 * - 图床双轨判定 GET /api/storage/image-backend?site_id= 带 60s 进程内缓存,
 *   任何失败(未配置/超时/非白名单)一律回退 legacy_landcloud——旧链路(兰空)保持可用,
 *   宁可停在旧链也不落到未配置的新链(与主站 lib/storage/quota.ts 同语义);
 * - W4-3 附件能力门 fetchSiteImageCapability():与双轨判定同端点同凭据(60s 缓存),
 *   任何失败/异常一律返回 null(fail-open),调用方按「可用」处理;
 * - W4-3 download_url 直连:附件列表/上传优先透传主站下发的绝对地址(pan 域),
 *   缺失/空串时回退旧拼接 `${base}/files/${key}` 兜底。
 */

import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'

export type SiteImageBackend = 'legacy_landcloud' | 'storage_base'

const IMAGE_BACKEND_CACHE_MS = 60_000
const MAIN_FETCH_TIMEOUT_MS = 8_000
const MAIN_UPLOAD_TIMEOUT_MS = 30_000

/** 主站网关 origin(不带 /api;MERCHANT_API_BASE 惯例与商品查询一致) */
export function resolveMainStorageBase(): string {
  return (
    (process.env.MERCHANT_API_BASE || '').trim().replace(/\/+$/, '') ||
    'https://creator.proplus.onl'
  )
}

function mainApiToken(): string {
  return (process.env.MERCHANT_API_TOKEN || '').trim()
}

let backendMemo: { value: SiteImageBackend; at: number } | null = null
let backendInflight: Promise<SiteImageBackend> | null = null

/**
 * 当前站点的图床后端(60s 缓存;失败不缓存,下一张图自动重试)。
 * 模板编辑器图片上传前调用;video 不走本判定(仅 image 双轨)。
 */
export async function resolveSiteImageBackend(): Promise<SiteImageBackend> {
  const siteId = getBlogSiteIdOrNull()
  if (!siteId) return 'legacy_landcloud'

  if (backendMemo && Date.now() - backendMemo.at < IMAGE_BACKEND_CACHE_MS) {
    return backendMemo.value
  }
  if (backendInflight) return backendInflight

  backendInflight = (async (): Promise<SiteImageBackend> => {
    try {
      const res = await fetch(
        `${resolveMainStorageBase()}/api/storage/image-backend?site_id=${siteId}`,
        {
          headers: {
            Accept: 'application/json',
            ...(mainApiToken() ? { Authorization: `Bearer ${mainApiToken()}` } : {}),
          },
          signal: AbortSignal.timeout(MAIN_FETCH_TIMEOUT_MS),
          cache: 'no-store',
        }
      )
      if (!res.ok) return 'legacy_landcloud'
      const payload = (await res.json()) as { backend?: unknown }
      const value: SiteImageBackend =
        payload?.backend === 'storage_base' ? 'storage_base' : 'legacy_landcloud'
      backendMemo = { value, at: Date.now() }
      return value
    } catch {
      // 查询失败按 legacy 兜底且不缓存(短暂故障后下一张图即恢复)
      return 'legacy_landcloud'
    } finally {
      backendInflight = null
    }
  })()

  return backendInflight
}

/** 测试辅助:清空图床后端缓存 */
export function __resetImageBackendCacheForTest(): void {
  backendMemo = null
  backendInflight = null
}

// ---------------------------------------------------------------------------
// W4-3 附件能力门:附件跟随图床基座(与主站 /api/storage/image-backend 同源)
// ---------------------------------------------------------------------------

export type SiteImageCapability = {
  backend: SiteImageBackend
  attachmentsEnabled: boolean
  maxAttachmentMB: number
}

/** 主站未下发(或值非法)时的附件单文件上限兜底(与主站当前上限一致) */
const DEFAULT_MAX_ATTACHMENT_MB = 20

let capabilityMemo: { value: SiteImageCapability; at: number } | null = null
let capabilityInflight: Promise<SiteImageCapability | null> | null = null

function normalizeMaxAttachmentMB(raw: unknown): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_ATTACHMENT_MB
}

/**
 * 当前站点的附件能力(60s 缓存;失败不缓存)。
 * - 与 resolveSiteImageBackend 同一主站端点/超时/凭据规则;
 * - 站点身份缺失时按 legacy 语义直接判定附件不可用(确定性状态,不发请求);
 * - 任何失败/异常一律返回 null(fail-open):调用方按「可用」处理,
 *   不因主站抖动锁死正常站点的附件功能。
 */
export async function fetchSiteImageCapability(): Promise<SiteImageCapability | null> {
  const siteId = getBlogSiteIdOrNull()
  if (!siteId) {
    return {
      backend: 'legacy_landcloud',
      attachmentsEnabled: false,
      maxAttachmentMB: DEFAULT_MAX_ATTACHMENT_MB,
    }
  }

  if (capabilityMemo && Date.now() - capabilityMemo.at < IMAGE_BACKEND_CACHE_MS) {
    return capabilityMemo.value
  }
  if (capabilityInflight) return capabilityInflight

  capabilityInflight = (async (): Promise<SiteImageCapability | null> => {
    try {
      const res = await fetch(
        `${resolveMainStorageBase()}/api/storage/image-backend?site_id=${siteId}`,
        {
          headers: {
            Accept: 'application/json',
            ...(mainApiToken() ? { Authorization: `Bearer ${mainApiToken()}` } : {}),
          },
          signal: AbortSignal.timeout(MAIN_FETCH_TIMEOUT_MS),
          cache: 'no-store',
        }
      )
      if (!res.ok) return null
      const payload = (await res.json()) as {
        backend?: unknown
        attachmentsEnabled?: unknown
        maxAttachmentMB?: unknown
      }
      const backend: SiteImageBackend =
        payload?.backend === 'storage_base' ? 'storage_base' : 'legacy_landcloud'
      const value: SiteImageCapability = {
        backend,
        attachmentsEnabled:
          typeof payload?.attachmentsEnabled === 'boolean'
            ? payload.attachmentsEnabled
            : backend === 'storage_base',
        maxAttachmentMB: normalizeMaxAttachmentMB(payload?.maxAttachmentMB),
      }
      capabilityMemo = { value, at: Date.now() }
      return value
    } catch {
      // 查询失败按 fail-open 返回 null 且不缓存(短暂故障后自动恢复)
      return null
    } finally {
      capabilityInflight = null
    }
  })()

  return capabilityInflight
}

/** 测试辅助:清空附件能力缓存 */
export function __resetSiteImageCapabilityCacheForTest(): void {
  capabilityMemo = null
  capabilityInflight = null
}

// ---------------------------------------------------------------------------
// 附件(attachment)主站代理原语:列表 / 上传 / 删除
// ---------------------------------------------------------------------------

export type MainSiteAttachment = {
  key: string
  original_name: string | null
  size: number
  mime: string | null
  created_at: string
  /** 绝对下载地址:优先主站下发(pan 域);缺失/空串回退 `${base}/files/${key}` 拼接 */
  download_url: string
}

const POST_KEY_RE = /^[a-z0-9-]{1,120}$/

/** 附件关联文章 slug 白名单(与主站上传 API/migration CHECK 同口径) */
export function isValidAttachmentPostKey(raw: string): boolean {
  return POST_KEY_RE.test((raw || '').trim())
}

type MainCallResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

async function mainFetchJson<T>(
  url: string,
  init: RequestInit
): Promise<MainCallResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(mainApiToken() ? { Authorization: `Bearer ${mainApiToken()}` } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    })
    const payload = (await res.json().catch(() => null)) as
      | (T & { success?: boolean; message?: string; error?: string })
      | null
    if (!res.ok || !payload || payload.success === false) {
      return {
        ok: false,
        status: res.status,
        error: payload?.message || payload?.error || `主站接口返回 HTTP ${res.status}`,
      }
    }
    return { ok: true, data: payload as T }
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error ? error.message : '主站接口请求失败',
    }
  }
}

/** 读取某文章 slug 的附件列表(主站返回白名单字段;download_url 优先透传主站
 *  下发的绝对地址(pan 域),缺失/空串回退旧拼接 `${base}/files/${key}` 兜底)。 */
export async function listMainSiteAttachments(postKey: string): Promise<MainCallResult<{ items: MainSiteAttachment[] }>> {
  const siteId = getBlogSiteIdOrNull()
  const slug = (postKey || '').trim()
  if (!siteId) return { ok: false, status: 500, error: '站点身份尚未配置(BLOG_SITE_ID)' }
  if (!isValidAttachmentPostKey(slug)) return { ok: false, status: 400, error: '文章 slug 格式不合法' }

  const base = resolveMainStorageBase()
  const result = await mainFetchJson<{
    items: Array<Omit<MainSiteAttachment, 'download_url'> & { download_url?: string | null }>
  }>(
    `${base}/api/storage/attachments?site_id=${siteId}&post_key=${encodeURIComponent(slug)}`,
    { method: 'GET' }
  )
  if (!result.ok) return result

  return {
    ok: true,
    data: {
      items: (result.data.items || []).map((item) => ({
        ...item,
        download_url: (item.download_url || '').trim() || `${base}/files/${item.key}`,
      })),
    },
  }
}

/** 上传附件(type=attachment + post_key;buffer 来自模板服务端读流,不经浏览器)。
 *  回执 download_url 为主站下发的绝对地址(pan 域),可能缺失。 */
export async function uploadMainSiteAttachment(input: {
  buffer: Buffer
  filename: string
  contentType: string
  postKey: string
}): Promise<MainCallResult<{ key: string; url: string; size: number; download_url?: string | null }>> {
  const siteId = getBlogSiteIdOrNull()
  const slug = (input.postKey || '').trim()
  if (!siteId) return { ok: false, status: 500, error: '站点身份尚未配置(BLOG_SITE_ID)' }
  if (!isValidAttachmentPostKey(slug)) return { ok: false, status: 400, error: '文章 slug 格式不合法' }
  if (!mainApiToken()) return { ok: false, status: 500, error: '主站凭据未配置(MERCHANT_API_TOKEN)' }

  const form = new FormData()
  form.append(
    'file',
    new Blob([input.buffer], { type: input.contentType }),
    input.filename || 'attachment'
  )
  form.append('type', 'attachment')
  form.append('site_id', siteId)
  form.append('post_key', slug)

  return mainFetchJson<{ key: string; url: string; size: number }>(
    `${resolveMainStorageBase()}/api/storage/upload`,
    {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(MAIN_UPLOAD_TIMEOUT_MS),
    }
  )
}

/** 删除附件(软删元数据 + 驱动删除;幂等)。 */
export async function deleteMainSiteObject(key: string): Promise<MainCallResult<{ key: string; already_deleted?: boolean }>> {
  const siteId = getBlogSiteIdOrNull()
  const trimmed = (key || '').trim()
  if (!siteId) return { ok: false, status: 500, error: '站点身份尚未配置(BLOG_SITE_ID)' }
  if (!trimmed) return { ok: false, status: 400, error: '缺少待删除对象 key' }

  return mainFetchJson<{ key: string; already_deleted?: boolean }>(
    `${resolveMainStorageBase()}/api/storage/delete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: trimmed, site_id: siteId }),
    }
  )
}

// ---------------------------------------------------------------------------
// 存储用量(S3FIX):主站 /api/storage/usage 代理原语(附件管理用量条数据源)
// ---------------------------------------------------------------------------

export type MainSiteUsage = {
  usedBytes: number
  quotaBytes: number
  usedPct: number
  filesCount: number
  /** S4-1 主站 API 已返回：账号级冻结态（storage_frozen_at 非空；只禁上传不禁读）。 */
  frozen: boolean
}

/**
 * 读取本站归属创作者的存储用量(与主站「我的存储」同源同口径)。
 *
 * - 站点身份 = BLOG_SITE_ID;缺失时返回失败(调用方按降级展示「—」,不阻断);
 * - usedPct 为 0~∞ 百分比(可超 100,供前端画条/乐观预检);后端配额仍强制;
 * - quotaBytes/frozen 随主站 S4-1 透传(配额 plan 感知;frozen=true 上传会被
 *   主站 403 拒绝,前端仅提示与禁用)。
 */
export async function fetchMainSiteUsage(): Promise<MainCallResult<MainSiteUsage>> {
  const siteId = getBlogSiteIdOrNull()
  if (!siteId) return { ok: false, status: 500, error: '站点身份尚未配置(BLOG_SITE_ID)' }

  return mainFetchJson<MainSiteUsage>(
    `${resolveMainStorageBase()}/api/storage/usage?site_id=${siteId}`,
    { method: 'GET' }
  )
}
