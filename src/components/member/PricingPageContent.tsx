'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { BlockRender } from '@/src/components/blocks/BlockRender'
import { MemberLoginDialog } from '@/src/components/member/MemberLoginDialog'
import { useActiveTheme } from '@/src/components/theme/ActiveThemeProvider'
import type { SiteMembershipConfig } from '@/src/lib/blog/membershipGate'
import { isTweetDarkTheme, isTweetLightTheme } from '@/src/themes/tweet/tweetTheme'
import type { BlockResponse } from '@/src/types/notion'

/**
 * 站点会员 B4-W6:/pricing「会员说明」页内容(保留主题壳层,由 [page].tsx 接线)。
 * - 页头:标题「会员说明」+ 默认说明段(文案 A);Notion 页存在且有正文块时,
 *   正文块渲染于页头之下(block render 既有管道);
 * - 档位/权益卡组:config.plans 逐档({days} 天 / ¥{price} + 通用权益要点 文案 B);
 * - 主 CTA:guest →「登录后订阅」(开 W1 弹窗);active →「订阅」跳 store 新开链
 *   ${NEXT_PUBLIC_STORE_URL}/p/{sku}(Q4:无 renew 场景取环境变量,不取中心 store_url);
 *   expired →「续费」走 /api/member/renew-url;
 * - 保障说明块(文案 C)。挂载即探测一次 session(无双轮询)。
 */

export const PRICING_INTRO_TEXT =
  '本博客开通了站点会员。订阅后即可阅读站内全部会员专属内容；会员期内不限次数阅读，到期后会员内容将重新锁定，续费即可恢复。'

export const PRICING_BENEFIT_ITEMS = [
  '解锁站内全部会员专属内容',
  '会员期内不限次数阅读',
  '到期前可随时续费，时长顺延',
] as const

export const PRICING_GUARANTEE_TEXT =
  '权益保障：会员权益调整会提前公告；如遇不可用问题可通过站内联系方式反馈，我们会尽快处理。'

export const PRICING_RENEW_ERROR_TEXT = '暂时不可用，请稍后重试'

type SessionView = 'probing' | 'guest' | 'active' | 'expired'

function resolveStoreUrl(): string {
  if (typeof process === 'undefined') return ''
  return (process.env.NEXT_PUBLIC_STORE_URL || '').trim().replace(/\/+$/, '')
}

export function PricingPageContent({
  membership,
  blocks,
  variant = 'default',
}: {
  membership: SiteMembershipConfig
  blocks?: BlockResponse[]
  variant?: 'default' | 'gallery' | 'tweet'
}) {
  const activeTheme = useActiveTheme()
  const [view, setView] = useState<SessionView>('probing')
  const [loginOpen, setLoginOpen] = useState(false)
  const [renewDays, setRenewDays] = useState<number | null>(null)
  const [renewError, setRenewError] = useState('')
  const [renewErrorDays, setRenewErrorDays] = useState<number | null>(null)

  // 挂载即探测一次(单次;无轮询)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch('/api/member/session', { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (cancelled) return
        const status = data?.status
        if (status === 'active') setView('active')
        else if (status === 'expired') setView('expired')
        else setView('guest')
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
    if (renewDays !== null) return
    setRenewDays(days)
    setRenewError('')
    setRenewErrorDays(null)
    try {
      const res = await fetch('/api/member/renew-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success && typeof data.url === 'string' && data.url) {
        setRenewDays(null)
        window.open(data.url, '_blank', 'noopener')
        return
      }
      setRenewError(PRICING_RENEW_ERROR_TEXT)
      setRenewErrorDays(days)
    } catch {
      setRenewError(PRICING_RENEW_ERROR_TEXT)
      setRenewErrorDays(days)
    } finally {
      setRenewDays(null)
    }
  }, [renewDays])

  // ---- 面板主题三态(与登录弹窗同源) ----
  const panelTheme =
    isTweetLightTheme(activeTheme) || activeTheme === 'gallery'
      ? 'light'
      : isTweetDarkTheme(activeTheme)
        ? 'dark'
        : 'auto'
  const cardCls =
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
  const priceCls =
    panelTheme === 'dark'
      ? 'text-white'
      : panelTheme === 'light'
        ? 'text-neutral-900'
        : 'text-neutral-900 dark:text-white'
  const primaryButtonCls =
    panelTheme === 'dark'
      ? 'bg-blue-600 hover:bg-blue-500'
      : panelTheme === 'light'
        ? 'bg-neutral-900 hover:bg-neutral-700'
        : 'bg-neutral-900 hover:bg-neutral-700 dark:bg-blue-600 dark:hover:bg-blue-500'

  const storeUrl = resolveStoreUrl()

  const renderCta = (sku: string, days: number) => {
    if (view === 'expired') {
      const busy = renewDays === days
      return (
        <button
          type="button"
          onClick={() => void requestRenew(days)}
          disabled={busy}
          className={`w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${primaryButtonCls}`}
        >
          {busy ? '跳转中…' : '续费'}
        </button>
      )
    }
    if (view === 'active') {
      return (
        <a
          href={storeUrl ? `${storeUrl}/p/${sku}` : '#'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (!storeUrl) e.preventDefault()
          }}
          className={`block w-full rounded-lg px-4 py-2 text-center text-sm font-semibold text-white transition-all active:scale-[0.98] ${primaryButtonCls}`}
        >
          订阅
        </a>
      )
    }
    // guest(含 probing:先引导登录,探测完成自动切换)
    return (
      <button
        type="button"
        onClick={() => setLoginOpen(true)}
        className={`w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all active:scale-[0.98] ${primaryButtonCls}`}
      >
        登录后订阅
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-8 py-2">
      {/* 页头:标题 + 默认说明段;Notion 正文块存在时渲染于其下 */}
      <div>
        <h2 className={`text-lg font-semibold ${titleCls}`}>会员说明</h2>
        <p className={`mt-2 text-sm leading-relaxed ${mutedCls}`}>
          {PRICING_INTRO_TEXT}
        </p>
      </div>
      {blocks && blocks.length > 0 ? (
        <div className="break-words">
          <BlockRender blocks={blocks} variant={variant} />
        </div>
      ) : null}

      {/* 档位/权益卡组 */}
      {membership.plans.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {membership.plans.map((plan) => (
            <div
              key={plan.sku}
              className={`flex flex-col gap-4 rounded-2xl border p-5 ${cardCls}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className={`text-sm font-medium ${titleCls}`}>
                  {plan.days} 天
                </span>
                <span className={`text-2xl font-extrabold ${priceCls}`}>
                  ¥{plan.price}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {PRICING_BENEFIT_ITEMS.map((item) => (
                  <li key={item} className={`flex items-start gap-2 text-xs leading-relaxed ${mutedCls}`}>
                    <span aria-hidden="true">·</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {renderCta(plan.sku, plan.days)}
              {view === 'expired' && renewError && renewErrorDays === plan.days ? (
                <p className="text-xs text-red-500">{renewError}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* 保障说明块 */}
      <p className={`text-xs leading-relaxed ${mutedCls}`}>
        {PRICING_GUARANTEE_TEXT}
      </p>

      <MemberLoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  )
}
