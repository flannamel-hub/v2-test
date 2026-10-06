'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useState } from 'react'
import { BlockRender } from '@/src/components/blocks/BlockRender'
import { MemberLoginDialog } from '@/src/components/member/MemberLoginDialog'
import { CrownIcon } from '@/src/components/member/MemberNav'
import { useMemberContent } from '@/src/components/post/MemberAwareBlockRender'
import { useActiveTheme } from '@/src/components/theme/ActiveThemeProvider'
import { isTweetDarkTheme, isTweetLightTheme } from '@/src/themes/tweet/tweetTheme'
import type { BlockResponse } from '@/src/types/notion'

/**
 * 站点会员 B2/B4:会员区锁区组件(三态面板)。
 * - 页 props membershipConfig 缺失/未启用(经 Context 传入)→ 渲染 null(零可见);
 * - 挂载先拉 /api/member/session,active 时再拉 /api/member/content;
 * - 客户端应用层内存缓存:slug → {etag, blocks},再次挂载带 If-None-Match → 304 复用;
 *   刷新页面不保留(仅内存);不落 localStorage,cookie 由服务端 Set-Cookie;
 * - B4-W1:登录弹窗全局化(MemberLoginDialog,含 QR 上传解码/打开探测轻态);
 *   弹窗状态所有权已移出本组件,勿再留双份;
 * - B4-W5:expired 面板「立即续费」直链(消费 B2-E10):调 /api/member/renew-url
 *   (config.plans[0].days)→ window.open;失败/无档位回落「前往会员中心」;
 * - R9-5:guest 面板改版(档位窗口与订阅直达链已下线;皇冠标题+中心提示;
 *   「已有会员？立即登录→」开弹窗路径不变)。
 * - R10-B：guest 面板毛玻璃+红按钮「获取会员」（皇冠悬挂居中）+新标题（副标题下线）。
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

export function MemberContentGate({ postSlug, variant }: MemberContentGateProps) {
  const ctx = useMemberContent()
  const config = ctx?.config ?? null
  const configEnabled = !!config
  const activeTheme = useActiveTheme()
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('probing')
  const [content, setContent] = useState<ContentState>({ status: 'idle' })
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const [loginAnomalyError, setLoginAnomalyError] = useState('')
  const [renewPhase, setRenewPhase] = useState<'idle' | 'requesting' | 'failed'>('idle')

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
            // 登录成功但会话仍 guest(异常形态):重开弹窗注入错误行
            setLoginAnomalyError('登录状态异常，请重试')
            setLoginDialogOpen(true)
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
    if (!configEnabled) return
    void runSession()
  }, [configEnabled, runSession])

  // B4-W5:expired 面板「立即续费」直链(plans[0];失败回落「前往会员中心」)
  const requestRenew = useCallback(async () => {
    const plan = config?.plans[0]
    if (!plan || renewPhase === 'requesting') return
    setRenewPhase('requesting')
    try {
      const res = await fetch('/api/member/renew-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: plan.days }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success && typeof data.url === 'string' && data.url) {
        setRenewPhase('idle')
        window.open(data.url, '_blank', 'noopener')
        return
      }
      setRenewPhase('failed')
    } catch {
      setRenewPhase('failed')
    }
  }, [config, renewPhase])

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
  const primaryButtonCls =
    panelTheme === 'dark'
      ? 'bg-blue-600 hover:bg-blue-500'
      : panelTheme === 'light'
        ? 'bg-neutral-900 hover:bg-neutral-700'
        : 'bg-neutral-900 hover:bg-neutral-700 dark:bg-blue-600 dark:hover:bg-blue-500'
  // R10-B：guest 面板毛玻璃（拍板 1A·基础款；深浅/auto 三态适配）
  const guestPanelCls =
    panelTheme === 'dark'
      ? 'border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_34px_-14px_rgba(0,0,0,0.65)]'
      : panelTheme === 'light'
        ? 'border-[rgba(0,0,0,0.06)] bg-[rgba(243,246,251,0.55)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_14px_34px_-18px_rgba(15,23,42,0.22)]'
        : 'border-[rgba(0,0,0,0.06)] bg-[rgba(243,246,251,0.55)] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_14px_34px_-18px_rgba(15,23,42,0.22)] dark:border-[rgba(255,255,255,0.10)] dark:bg-[rgba(255,255,255,0.06)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_34px_-14px_rgba(0,0,0,0.65)]'
  // R10-B：guest 主按钮红底（与公告卡红钮同一品牌红渐变；expired/revoked 面板继续用 primaryButtonCls 不动）
  const gateBrandButtonCls =
    'bg-gradient-to-b from-[#e24a4a] to-[#c51f25] hover:from-[#d94040] hover:to-[#b81c22]'

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
    // R2-B5a(E2/E5):到期面板保留主按钮「立即续费」,移除「进入会员中心」链接;
    // plans 为空/续费失败 → 回落主按钮「加入会员」→ /pricing
    const showRenewPrimary = config.plans.length > 0 && renewPhase !== 'failed'
    return (
      <div
        className={`member-gate-panel my-6 overflow-hidden rounded-xl border shadow-sm ${panelCls}`}
      >
        <div className="flex flex-col items-center gap-3 px-5 py-8 text-center select-none">
          <LockIcon className={`h-5 w-5 ${mutedCls}`} />
          <p className={`text-sm font-medium ${titleCls}`}>会员已到期</p>
          {showRenewPrimary ? (
            <button
              type="button"
              onClick={() => void requestRenew()}
              disabled={renewPhase === 'requesting'}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${primaryButtonCls}`}
            >
              {renewPhase === 'requesting' ? '跳转中…' : '立即续费'}
            </button>
          ) : (
            <Link
              href="/pricing"
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all active:scale-[0.98] ${primaryButtonCls}`}
            >
              加入会员
            </Link>
          )}
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
  return (
    <div className={`member-gate-panel my-6 overflow-hidden rounded-xl border ${guestPanelCls}`}>
      <div className="flex flex-col items-center gap-4 px-5 py-8 text-center select-none">
        <p className={`text-sm font-bold ${titleCls}`}>内容已隐藏，请订阅会员后查看</p>

        {/* R10-B：红底主按钮「获取会员」+ 实心皇冠悬挂（文字严格居中，不占居中组） */}
        <Link
          href="/pricing"
          className={`w-full max-w-xs rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all active:scale-[0.98] ${gateBrandButtonCls}`}
        >
          <span className="relative inline-flex items-center justify-center">
            <CrownIcon className="absolute right-full top-1/2 -translate-y-1/2 mr-1.5 h-3.5 w-3.5 text-[#FACC15]" />
            <span>获取会员</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => {
            setLoginAnomalyError('')
            setLoginDialogOpen(true)
          }}
          className={`text-xs font-medium transition-colors ${mutedCls} hover:underline`}
        >
          已有会员？立即登录→
        </button>
      </div>

      <MemberLoginDialog
        open={loginDialogOpen}
        onClose={() => {
          setLoginDialogOpen(false)
          setLoginAnomalyError('')
        }}
        onSuccess={() => void runSession({ afterLogin: true })}
        onDisabled={() => void runSession()}
        initialError={loginAnomalyError}
      />
    </div>
  )
}
