'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useState } from 'react'
import { BlockRender } from '@/src/components/blocks/BlockRender'
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
 * - R11-B:登录入口链整体删除(登录按钮+弹窗+异常态 state 均不再属于本组件;
 *   读者侧登录路径=导航「登录」与公告卡白钮,均在组件外,未动);
 * - B4-W5:expired 面板「立即续费」直链(消费 B2-E10):调 /api/member/renew-url
 *   (config.plans[0].days)→ window.open;失败/无档位回落「前往会员中心」;
 * - R9-5:guest 面板改版(档位窗口与订阅直达链已下线;皇冠标题+中心提示;
 *   登录入口已随 R11-B 移除)。
 * - R11-B：guest 面板毛玻璃保留;「获取会员」按钮纯平色轻量化(零渐变,无皇冠,
 *   文字严格居中)+间距重调(gap-5/py-7)。
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
    async () => {
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
  // R10-B/R11-B：guest 主按钮红底纯平色（方案 C·零渐变；expired/revoked 面板继续用 primaryButtonCls 不动）
  const gateBrandButtonCls =
    'bg-[#dc2626] hover:bg-[#e03535] shadow-[0_6px_16px_-10px_rgba(220,38,38,0.5)]'

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
      <div className="flex flex-col items-center gap-5 px-5 py-7 text-center select-none">
        <p className={`text-sm font-bold ${titleCls}`}>内容已隐藏，请订阅会员后查看</p>

        {/* R11-B：红底主按钮「获取会员」（纯平色轻量化，文字严格居中） */}
        <Link
          href="/pricing"
          className={`w-full max-w-xs rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-[0.98] ${gateBrandButtonCls}`}
        >
          <span>获取会员</span>
        </Link>
      </div>
    </div>
  )
}
