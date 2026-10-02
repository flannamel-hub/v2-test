'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { BlockRender } from '@/src/components/blocks/BlockRender'
import { useMemberContent } from '@/src/components/post/MemberAwareBlockRender'
import { useActiveTheme } from '@/src/components/theme/ActiveThemeProvider'
import { isTweetDarkTheme, isTweetLightTheme } from '@/src/themes/tweet/tweetTheme'
import type { BlockResponse } from '@/src/types/notion'

/**
 * 站点会员 B2:会员区锁区组件(三态面板 + 极简登录弹窗;B4 升级正式弹窗)。
 * - 页 props membershipConfig 缺失/未启用(经 Context 传入)→ 渲染 null(零可见);
 * - 挂载先拉 /api/member/session,active 时再拉 /api/member/content;
 * - 客户端应用层内存缓存:slug → {etag, blocks},再次挂载带 If-None-Match → 304 复用;
 *   刷新页面不保留(仅内存);不落 localStorage,cookie 由服务端 Set-Cookie;
 * - 弹窗为页内弹窗(禁原生),经 createPortal 挂 body(祖先可能带 transform/backdrop-blur)。
 */

type MemberContentGateProps = {
  postSlug: string
  variant: 'default' | 'gallery' | 'tweet'
}

type SessionPhase =
  | 'probing'
  | 'guest'
  | 'active'
  | 'expired'
  | 'revoked'
  | 'disabled'
  | 'error'

type ContentState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; blocks: BlockResponse[] }
  | { status: 'error' }

const clientMemberContentCache = new Map<string, { etag: string; blocks: BlockResponse[] }>()

const LOGIN_ERROR_TEXT: Record<string, string> = {
  invalid: '访问串无效',
  revoked: '该访问串已停用',
  rate_limited: '尝试过于频繁，请稍后再试',
  unavailable: '暂时不可用，请稍后重试',
}

const CONTENT_ERROR_TEXT = '加载失败，请刷新重试'

const LockIcon = ({ className = '' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="5" y="11" width="14" height="9.5" rx="2.5" />
    <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
  </svg>
)

function resolveStoreUrl(): string {
  if (typeof process === 'undefined') return ''
  return (process.env.NEXT_PUBLIC_STORE_URL || '').trim().replace(/\/+$/, '')
}

export function MemberContentGate({ postSlug, variant }: MemberContentGateProps) {
  const ctx = useMemberContent()
  const config = ctx?.config ?? null
  const configEnabled = !!config
  const activeTheme = useActiveTheme()
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('probing')
  const [content, setContent] = useState<ContentState>({ status: 'idle' })
  const [mounted, setMounted] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [accessKeyInput, setAccessKeyInput] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginSubmitting, setLoginSubmitting] = useState(false)

  const loadContent = useCallback(async () => {
    setContent({ status: 'loading' })
    const cached = clientMemberContentCache.get(postSlug) ?? null
    const headers: Record<string, string> = {}
    if (cached?.etag) headers['If-None-Match'] = cached.etag
    try {
      const res = await fetch(
        `/api/member/content?slug=${encodeURIComponent(postSlug)}`,
        { headers, cache: 'no-store' }
      )
      if (res.status === 304) {
        if (cached) {
          setContent({ status: 'ready', blocks: cached.blocks })
        } else {
          setContent({ status: 'error' })
        }
        return
      }
      if (res.status === 401) {
        // 会员态已失效(到期/撤销/换证)→ 回落 guest 面板
        setSessionPhase('guest')
        setContent({ status: 'idle' })
        return
      }
      if (res.status === 403) {
        // 门控在页面 ISR 之后被关闭 → 面板消失
        setSessionPhase('disabled')
        return
      }
      if (!res.ok) {
        setContent({ status: 'error' })
        return
      }
      const data = await res.json().catch(() => null)
      if (!data?.success) {
        setContent({ status: 'error' })
        return
      }
      const blocks: BlockResponse[] = Array.isArray(data.blocks) ? data.blocks : []
      const etag = res.headers.get('etag')
      if (etag) clientMemberContentCache.set(postSlug, { etag, blocks })
      setContent({ status: 'ready', blocks })
    } catch {
      setContent({ status: 'error' })
    }
  }, [postSlug])

  const runSession = useCallback(
    async (options?: { afterLogin?: boolean }) => {
      setSessionPhase('probing')
      setContent({ status: 'idle' })
      try {
        const res = await fetch('/api/member/session', { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        const status = data?.status
        if (status === 'active') {
          setSessionPhase('active')
          await loadContent()
        } else if (status === 'guest') {
          setSessionPhase('guest')
          if (options?.afterLogin) {
            // 登录成功但会话仍 guest(异常形态):重开弹窗加错误行
            setModalOpen(true)
            setLoginError('登录状态异常，请重试')
          }
        } else if (status === 'expired') {
          setSessionPhase('expired')
        } else if (status === 'revoked') {
          setSessionPhase('revoked')
        } else {
          // disabled / 未知 → 面板消失
          setSessionPhase('disabled')
        }
      } catch {
        setSessionPhase('error')
      }
    },
    [loadContent]
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!configEnabled) return
    void runSession()
  }, [configEnabled, runSession])

  const submitLogin = useCallback(async () => {
    const accessKey = accessKeyInput.trim()
    if (!accessKey || loginSubmitting) return
    setLoginSubmitting(true)
    setLoginError('')
    try {
      const res = await fetch('/api/member/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_key: accessKey }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success) {
        // 关闭弹窗 → 重跑 session+content 流程:
        // active → 渲染内容;expired → 到期面板(B1 login 对到期会员亦发 cookie)
        setModalOpen(false)
        setAccessKeyInput('')
        await runSession({ afterLogin: true })
        return
      }
      const err = data?.error
      if (err === 'disabled') {
        // 关弹窗并重跑 session(session 返回 disabled → 面板消失;
        // page props 的 membershipConfig 是 ISR 旧值,不可作为消失依据)
        setModalOpen(false)
        await runSession()
        return
      }
      setLoginError(LOGIN_ERROR_TEXT[err] ?? LOGIN_ERROR_TEXT.unavailable)
    } catch {
      setLoginError(LOGIN_ERROR_TEXT.unavailable)
    } finally {
      setLoginSubmitting(false)
    }
  }, [accessKeyInput, loginSubmitting, runSession])

  // ---- 面板主题三态(照抄 ArticlePasswordGate 的 panelTheme 逻辑) ----
  const panelTheme =
    isTweetLightTheme(activeTheme) || activeTheme === 'gallery'
      ? 'light'
      : isTweetDarkTheme(activeTheme)
        ? 'dark'
        : 'auto'
  const panelCls =
    panelTheme === 'dark'
      ? 'border-neutral-700 bg-[#181818]/95'
      : panelTheme === 'light'
        ? 'border-neutral-200/80 bg-white/95'
        : 'border-neutral-200/80 bg-white/95 dark:border-neutral-700 dark:bg-[#181818]/95'
  const titleCls =
    panelTheme === 'dark'
      ? 'text-neutral-200'
      : panelTheme === 'light'
        ? 'text-neutral-700'
        : 'text-neutral-700 dark:text-neutral-200'
  const mutedCls =
    panelTheme === 'dark'
      ? 'text-neutral-400'
      : panelTheme === 'light'
        ? 'text-neutral-500'
        : 'text-neutral-500 dark:text-neutral-400'
  const borderCls =
    panelTheme === 'dark'
      ? 'divide-neutral-700/80'
      : panelTheme === 'light'
        ? 'divide-neutral-200/80'
        : 'divide-neutral-200/80 dark:divide-neutral-700/80'
  const inputSurfaceCls =
    panelTheme === 'dark'
      ? 'bg-neutral-900 text-white'
      : panelTheme === 'light'
        ? 'bg-white text-neutral-900'
        : 'bg-white text-neutral-900 dark:bg-neutral-900 dark:text-white'
  const inputIdleCls =
    panelTheme === 'dark'
      ? 'border-transparent hover:bg-neutral-800 focus:border-blue-500'
      : panelTheme === 'light'
        ? 'border-neutral-200 hover:border-neutral-300 focus:border-neutral-900'
        : 'border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 dark:border-transparent dark:hover:bg-neutral-800 dark:focus:border-blue-500'
  const primaryButtonCls =
    panelTheme === 'dark'
      ? 'bg-blue-600 hover:bg-blue-500'
      : panelTheme === 'light'
        ? 'bg-neutral-900 hover:bg-neutral-700'
        : 'bg-neutral-900 hover:bg-neutral-700 dark:bg-blue-600 dark:hover:bg-blue-500'

  // ---- 渲染 ----
  // 页 props membershipConfig 缺失/未启用 → 零可见
  // (即便碰到异常残留的会员块也不显示任何东西)
  if (!config) return null

  if (sessionPhase === 'disabled') return null

  if (sessionPhase === 'probing') {
    return (
      <div className="member-gate-skeleton my-6 space-y-2.5 select-none" aria-hidden="true">
        <div className="h-4 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
      </div>
    )
  }

  if (sessionPhase === 'active') {
    if (content.status === 'loading' || content.status === 'idle') {
      return (
        <div className="member-gate-skeleton my-6 space-y-2.5 select-none" aria-hidden="true">
          <div className="h-4 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
        </div>
      )
    }
    if (content.status === 'error') {
      return (
        <p className={`my-6 text-center text-sm ${mutedCls}`}>{CONTENT_ERROR_TEXT}</p>
      )
    }
    return <BlockRender blocks={content.blocks} variant={variant} />
  }

  if (sessionPhase === 'error') {
    return <p className={`my-6 text-center text-sm ${mutedCls}`}>{CONTENT_ERROR_TEXT}</p>
  }

  if (sessionPhase === 'expired') {
    return (
      <div
        className={`member-gate-panel my-6 overflow-hidden rounded-xl border shadow-sm ${panelCls}`}
      >
        <div className="flex flex-col items-center gap-3 px-5 py-8 text-center select-none">
          <LockIcon className={`h-5 w-5 ${mutedCls}`} />
          <p className={`text-sm font-medium ${titleCls}`}>会员已到期</p>
          <Link
            href="/member"
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all active:scale-[0.98] ${primaryButtonCls}`}
          >
            前往会员中心
          </Link>
        </div>
      </div>
    )
  }

  if (sessionPhase === 'revoked') {
    return (
      <div
        className={`member-gate-panel my-6 overflow-hidden rounded-xl border shadow-sm ${panelCls}`}
      >
        <div className="flex flex-col items-center gap-3 px-5 py-8 text-center select-none">
          <LockIcon className={`h-5 w-5 ${mutedCls}`} />
          <p className={`text-sm font-medium ${titleCls}`}>该会员已被停用</p>
        </div>
      </div>
    )
  }

  // ---- guest:会员专属面板 ----
  const storeUrl = resolveStoreUrl()

  return (
    <div
      className={`member-gate-panel my-6 overflow-hidden rounded-xl border shadow-sm ${panelCls}`}
    >
      <div className="flex flex-col items-center gap-4 px-5 py-8 text-center select-none">
        <LockIcon className={`h-5 w-5 ${mutedCls}`} />
        <p className={`text-sm font-medium ${titleCls}`}>会员专属内容</p>

        {config.plans.length > 0 ? (
          <div className={`w-full max-w-xs divide-y rounded-lg border ${borderCls} ${panelCls}`}>
            {config.plans.map((plan) => (
              <div key={plan.sku} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className={`text-sm ${titleCls}`}>
                  {plan.days} 天 · ¥{plan.price}
                </span>
                {storeUrl ? (
                  <a
                    href={`${storeUrl}/p/${plan.sku}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`whitespace-nowrap text-xs font-medium transition-colors ${mutedCls} hover:underline`}
                  >
                    订阅
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setLoginError('')
            setModalOpen(true)
          }}
          className={`w-full max-w-xs rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all active:scale-[0.98] ${primaryButtonCls}`}
        >
          使用访问串登录
        </button>
      </div>

      {mounted && modalOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="member-login-title"
              onClick={() => {
                if (!loginSubmitting) setModalOpen(false)
              }}
            >
              <div
                className={`w-full max-w-[320px] rounded-xl border shadow-xl ${panelCls}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col gap-3 px-4 py-5 select-none sm:px-5">
                  <p
                    id="member-login-title"
                    className={`text-center text-sm font-medium ${titleCls}`}
                  >
                    会员登录
                  </p>
                  <input
                    type="password"
                    placeholder="访问串"
                    className={`w-full rounded-lg border-2 px-3 py-2 text-sm outline-none transition-all ${inputSurfaceCls} ${
                      loginError ? 'border-red-500 focus:border-red-500' : inputIdleCls
                    }`}
                    value={accessKeyInput}
                    onChange={(e) => {
                      setAccessKeyInput(e.target.value)
                      if (loginError) setLoginError('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && accessKeyInput.trim() && !loginSubmitting) {
                        void submitLogin()
                      }
                    }}
                    autoFocus
                  />
                  {loginError ? (
                    <p className="text-center text-xs font-medium text-red-500">{loginError}</p>
                  ) : null}
                  <div className="flex flex-col gap-2.5">
                    <button
                      type="button"
                      onClick={() => void submitLogin()}
                      disabled={loginSubmitting || !accessKeyInput.trim()}
                      className={`w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${primaryButtonCls}`}
                    >
                      {loginSubmitting ? '登录中…' : '登录'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!loginSubmitting) setModalOpen(false)
                      }}
                      disabled={loginSubmitting}
                      className={`w-full rounded-lg px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${mutedCls} hover:opacity-80`}
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
