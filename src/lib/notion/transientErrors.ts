type NotionLikeError = {
  message?: string
  code?: string
  status?: number
  headers?: { get?: (name: string) => string | null }
}

/** Notion / 网络类临时错误（含 429 rate_limited） */
export function isTransientNotionError(error: unknown): boolean {
  const err = error as NotionLikeError
  const msg = String(err?.message || '')
  const code = String(err?.code || '').toLowerCase()
  const status = err?.status

  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true
  }
  if (/rate_limit/i.test(code)) return true
  if (/rate limit|too many requests/i.test(msg)) return true

  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket hang up|network|fetch failed|aborted|502|503|504/i.test(
    msg
  )
}

/** 读取 Notion Retry-After，否则指数退避（构建期上限更低，避免部署卡住数分钟） */
export function notionRetryDelayMs(error: unknown, attempt: number): number {
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
  const retryAfterCap = isBuild ? 2_500 : 12_000
  const backoffCap = isBuild ? 3_000 : 12_000

  const err = error as NotionLikeError
  const raw = err?.headers?.get?.('retry-after')
  const sec = raw ? parseInt(String(raw), 10) : NaN
  if (Number.isFinite(sec) && sec > 0) {
    return Math.min(sec * 1000, retryAfterCap)
  }
  return Math.min(400 * Math.pow(2, attempt), backoffCap)
}

export function notionRetryCount(): number {
  return 3
}

export function isNotionBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build'
}

/**
 * getStaticPaths：Notion 限流时不让整站构建失败，改由 fallback:on-demand 生成。
 */
export async function staticPathsOnNotionFailure<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (isTransientNotionError(error)) {
      console.warn(
        '[SSG] Notion transient error in getStaticPaths, deferring to on-demand generation:',
        error instanceof Error ? error.message : error
      )
      return fallback
    }
    throw error
  }
}
