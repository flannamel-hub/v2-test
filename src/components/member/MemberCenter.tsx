'use client'

import Link from 'next/link'
import { useRouter } from 'next/router'
import React, { useCallback, useEffect, useState } from 'react'
import { MemberLoginDialog } from '@/src/components/member/MemberLoginDialog'
import { useActiveTheme } from '@/src/components/theme/ActiveThemeProvider'
import type { SiteMembershipConfig } from '@/src/lib/blog/membershipGate'
import { isTweetDarkTheme, isTweetLightTheme } from '@/src/themes/tweet/tweetTheme'

/**
 * 【已退役 deprecated(2026-10-05 R2-B5a)】/member 页已改为 307 → /pricing,
 * 本组件不再被任何页面渲染;仅为 tests/member-b4-center / member-r1-handoff 的
 * 纯函数与文案导出而保留——勿在新页面引用本组件。
 *
 * 站点会员 B4-W3:/member 会员中心三态(active / expired / guest)。
 * - 挂载即调一次 /api/member/session(无双轮询,任何位置不加 interval);
 * - active:状态卡 + 档位列表(续费)+ 退出登录 + 小字;
 * - expired:到期提示 + 档位列表(续费主按钮)+ 退出 + 小字;
 * - guest:订阅说明段(文案 A)+ 查看会员说明(/pricing)+ 登录(开弹窗)+ 档位速览;
 * - 续费:POST /api/member/renew-url {days} → window.open(url, '_blank', 'noopener');
 *   错误按 body.error 分支(401→请先登录;unavailable 族→暂时不可用);
 * - R1:guest 订阅链接直达化(${storeUrl}/p/{sku}?go=1 同窗);
 *   顶部 failed 提示行(?handoff=failed,与三态视图无关,isReady 后即显)。
 */

/** 文案 A(/pricing 默认说明段与 /member guest 说明段同源,§7 单一事实源) */
export const MEMBER_PRICING_INTRO_TEXT =
  '本博客开通了站点会员。订阅后即可阅读站内全部会员专属内容；会员期内不限次数阅读，到期后会员内容将重新锁定，续费即可恢复。'

/** 会员中心小字(§7) */
export const MEMBER_CENTER_FOOTNOTE = {
  active: '会员状态以最近一次核验为准（变更 ≤24 小时生效）',
  expired: '续费完成后回到本站刷新即可恢复访问',
} as const

/** 续费失败行内文案(status 仅兜底,一律按 body.error 分支;§10.2-Q3) */
export const MEMBER_RENEW_ERROR_TEXT = {
  guest: '请先登录',
  unavailable: '暂时不可用，请稍后重试',
} as const

/** R1:回跳自动登录失败提示行文案(§7 粗稿,T1 定稿) */
export const MEMBER_HANDOFF_FAILED_TEXT =
  '自动登录未完成。若已完成支付，可回到支付页再次点击返回；也可用购买邮件中的访问串登录。'

/** R1:failed 提示行判定(isReady 门控纯函数,供测试断言;与三态视图无关) */
export function shouldShowHandoffFailedNotice(
  isReady: boolean,
  handoffQuery: unknown
): boolean {
  return isReady === true && handoffQuery === 'failed'
}

/** 会话状态 → 会员中心视图(active/expired 直接映射;其余一律 guest) */
export function resolveMemberCenterView(
  status: unknown
): 'active' | 'expired' | 'guest' {
  if (status === 'active') return 'active'
  if (status === 'expired') return 'expired'
  return 'guest'
}

/** expires_at(ISO)→ YYYY/MM/DD;无效/缺失返回 '' */
export function formatMemberExpiryDate(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}/${m}/${d}`
}

/** 续费错误 → 行内文案(按 body.error;status 仅兜底) */
export function resolveMemberRenewErrorText(
  status: number,
  body: { error?: unknown } | null
): string {
  const err = body?.error
  if (err === 'guest' || err === 'invalid' || status === 401) {
    return MEMBER_RENEW_ERROR_TEXT.guest
  }
  return MEMBER_RENEW_ERROR_TEXT.unavailable
}

function resolveStoreUrl(): string {
  if (typeof process === 'undefined') return ''
  return (process.env.NEXT_PUBLIC_STORE_URL || '').trim().replace(/\/+$/, '')
}

type RenewState =
  | { phase: 'idle' }
  | { phase: 'requesting'; days: number }
  | { phase: 'error'; days: number; message: string }

export function MemberCenter({ config }: { config: SiteMembershipConfig }) {
  const router = useRouter()
  const activeTheme = useActiveTheme()
  const [view, setView] = useState<'probing' | 'active' | 'expired' | 'guest'>(
    'probing'
  )
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [renew, setRenew] = useState<RenewState>({ phase: 'idle' })

  // 挂载即核一次(单次;无轮询)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch('/api/member/session', { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (cancelled) return
        setView(resolveMemberCenterView(data?.status))
        setExpiresAt(
          typeof data?.expires_at === 'string' ? data.expires_at : null
        )
      } catch {
        if (!cancelled) setView('guest')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const requestRenew = useCallback(async (days: number) => {
    if (renew.phase === 'requesting') return
    setRenew({ phase: 'requesting', days })
    try {
      const res = await fetch('/api/member/renew-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success && typeof data.url === 'string' && data.url) {
        setRenew({ phase: 'idle' })
        window.open(data.url, '_blank', 'noopener')
        return
      }
      setRenew({
        phase: 'error',
        days,
        message: resolveMemberRenewErrorText(res.status, data),
      })
    } catch {
      setRenew({
        phase: 'error',
        days,
        message: MEMBER_RENEW_ERROR_TEXT.unavailable,
      })
    }
  }, [renew.phase])

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/member/logout', { method: 'POST', cache: 'no-store' })
    } catch {
      // 服务端清 cookie;失败也回落 guest 视图
    }
    setView('guest')
    setExpiresAt(null)
    setRenew({ phase: 'idle' })
  }, [])

  const reprobeAfterLogin = useCallback(async () => {
    setView('probing')
    try {
      const res = await fetch('/api/member/session', { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      setView(resolveMemberCenterView(data?.status))
      setExpiresAt(
        typeof data?.expires_at === 'string' ? data.expires_at : null
      )
    } catch {
      setView('guest')
    }
  }, [])

  // ---- 面板主题三态(与登录弹窗同源) ----
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
  const primaryButtonCls =
    panelTheme === 'dark'
      ? 'bg-blue-600 hover:bg-blue-500'
      : panelTheme === 'light'
        ? 'bg-neutral-900 hover:bg-neutral-700'
        : 'bg-neutral-900 hover:bg-neutral-700 dark:bg-blue-600 dark:hover:bg-blue-500'

  const storeUrl = resolveStoreUrl()
  const expiryLabel = formatMemberExpiryDate(expiresAt)

  const renderPlans = () => (
    <div className={`w-full max-w-sm divide-y rounded-xl border ${borderCls} ${panelCls}`}>
      {config.plans.map((plan) => {
        const busy = renew.phase === 'requesting' && renew.days === plan.days
        const error =
          renew.phase === 'error' && renew.days === plan.days
            ? renew.message
            : ''
        return (
          <div key={plan.sku} className="flex flex-col gap-1.5 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className={`text-sm font-medium ${titleCls}`}>
                {plan.days} 天 · ¥{plan.price}
              </span>
              <button
                type="button"
                onClick={() => void requestRenew(plan.days)}
                disabled={busy}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${primaryButtonCls}`}
              >
                {busy ? '跳转中…' : '续费'}
              </button>
            </div>
            {error ? (
              <p className="text-xs text-red-500">{error}</p>
            ) : null}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      {shouldShowHandoffFailedNotice(router.isReady, router.query?.handoff) ? (
        <p
          className={`w-full max-w-sm rounded-xl border px-4 py-3 text-center text-xs leading-relaxed ${panelCls} ${mutedCls}`}
        >
          {MEMBER_HANDOFF_FAILED_TEXT}
        </p>
      ) : null}
      {view === 'probing' ? (
        <div className="member-center-skeleton w-full max-w-sm space-y-2.5 select-none" aria-hidden="true">
          <div className="h-5 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
          <div className="h-5 w-5/6 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
          <div className="h-5 w-2/3 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-700/60" />
        </div>
      ) : view === 'active' ? (
        <>
          <div className={`w-full max-w-sm rounded-xl border px-5 py-5 text-center ${panelCls}`}>
            <p className={`text-sm font-medium ${titleCls}`}>
              {expiryLabel ? `会员有效期至 ${expiryLabel}` : '会员生效中'}
            </p>
            <p className={`mt-2 text-xs ${mutedCls}`}>{MEMBER_CENTER_FOOTNOTE.active}</p>
          </div>
          {config.plans.length > 0 ? renderPlans() : null}
          <button
            type="button"
            onClick={() => void handleLogout()}
            className={`text-xs transition-colors hover:underline ${mutedCls}`}
          >
            退出登录
          </button>
        </>
      ) : view === 'expired' ? (
        <>
          <div className={`w-full max-w-sm rounded-xl border px-5 py-5 text-center ${panelCls}`}>
            <p className={`text-sm font-medium ${titleCls}`}>
              {expiryLabel ? `会员已到期（${expiryLabel}）` : '会员已到期'}
            </p>
            <p className={`mt-2 text-xs ${mutedCls}`}>{MEMBER_CENTER_FOOTNOTE.expired}</p>
          </div>
          {config.plans.length > 0 ? renderPlans() : null}
          <button
            type="button"
            onClick={() => void handleLogout()}
            className={`text-xs transition-colors hover:underline ${mutedCls}`}
          >
            退出登录
          </button>
        </>
      ) : (
        <>
          <p className={`w-full max-w-sm text-sm leading-relaxed ${mutedCls}`}>
            {MEMBER_PRICING_INTRO_TEXT}
          </p>
          <div className="flex w-full max-w-sm flex-col gap-2.5 sm:flex-row">
            <Link
              href="/pricing"
              className={`flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold text-white transition-all active:scale-[0.98] ${primaryButtonCls}`}
            >
              查看会员说明
            </Link>
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className={`flex-1 rounded-lg border px-4 py-2 text-sm transition-colors ${
                panelTheme === 'dark'
                  ? 'border-neutral-700 hover:bg-neutral-800'
                  : panelTheme === 'light'
                    ? 'border-neutral-200 hover:bg-neutral-100'
                    : 'border-neutral-200 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800'
              } ${titleCls}`}
            >
              登录
            </button>
          </div>
          {config.plans.length > 0 ? (
            <div className={`w-full max-w-sm divide-y rounded-xl border ${borderCls} ${panelCls}`}>
              {config.plans.map((plan) => (
                <div key={plan.sku} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className={`text-sm ${titleCls}`}>{plan.days} 天 · ¥{plan.price}</span>
                  {storeUrl ? (
                    <a
                      href={`${storeUrl}/p/${plan.sku}?go=1`}
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
        </>
      )}

      <MemberLoginDialog
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => void reprobeAfterLogin()}
        onDisabled={() => void reprobeAfterLogin()}
      />
    </div>
  )
}
