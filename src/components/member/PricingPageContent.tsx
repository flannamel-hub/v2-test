'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { MemberLoginDialog, formatMembershipTierLabel } from '@/src/components/member/MemberLoginDialog'
import { CrownIcon } from '@/src/components/member/MemberNav'
import { MEMBER_HANDOFF_FAILED_TEXT } from '@/src/components/member/MemberCenter'
import { useActiveTheme } from '@/src/components/theme/ActiveThemeProvider'
import type {
  SiteMembershipConfig,
  SiteMembershipCopy,
} from '@/src/lib/blog/membershipGate'
import { isTweetDarkTheme, isTweetLightTheme } from '@/src/themes/tweet/tweetTheme'
import { resolvePricingCardStyle } from '@/src/lib/blog/pricingCardStyles'

/**
 * 站点会员 B4-W6/R2-B5a:/pricing「会员说明」页内容(保留主题壳层,由 [page].tsx 接线)。
 * - 页头:标题「会员说明」+ 说明段;R2-B5a 起不再透传 Notion blocks,文案分段渲染:
 *   intro/benefits/guarantee 逐段取 membership.copy,缺省/空回落内置默认
 *   (未编辑站零视觉变化);
 * - 档位/权益卡组:config.plans 逐档({days} 天 / ¥{price} + 权益要点);
 * - 主 CTA:guest →「立即购买」直链 ${NEXT_PUBLIC_STORE_URL}/p/{sku}?go=1 同窗
 *   (R1 直达化;storeUrl 空时 preventDefault 先例照旧);active →「立即购买」跳
 *   store 新开链 ${NEXT_PUBLIC_STORE_URL}/p/{sku}(Q4:无 renew 场景取环境变量,
 *   不取中心 store_url);expired →「续费」走 /api/member/renew-url;
 * - R2-B5a R2:挂载读一次 router.query.handoff === 'failed' → 一次性轻提示行
 *   (handoff 失败落点已改 /pricing?handoff=failed)+ 登录弹窗次入口;
 * - 保障说明块。挂载即探测一次 session(无双轮询)。
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

/** copy 渲染侧上限(读侧 normalizeCopy 已归一,此为组件级双保险) */
export const PRICING_COPY_BENEFIT_MAX_ITEMS = 8
export const PRICING_COPY_BENEFIT_ITEM_MAX = 120

export const PRICING_FAQ_TITLE_TEXT = '常见问题'
/** R6-6:FAQ 双保险上限(读侧 normalizeCopy 已归一,此为组件级) */
export const PRICING_COPY_FAQ_MAX_ITEMS = 8
export const PRICING_COPY_FAQ_Q_MAX = 80
export const PRICING_COPY_FAQ_A_MAX = 300
/** R6-6:FAQ 默认 5 组(定稿逐字;与 AdminDashboard 默认镜像两处须同步——管理侧=批C) */
export const PRICING_FAQ_DEFAULT: ReadonlyArray<{ q: string; a: string }> = [
  { q: '可以使用哪些付款方式？', a: '以平台付款页显示为准，所有会员方案都是一次性购买，不会自动续费。' },
  { q: '付款未成功怎么办？', a: '没付款成功可以更换支付渠道或切换付款通道，如页面异常请立即联系平台客服，付款后等待跳转，不要重复发起购买。' },
  { q: '购买后多久生效？', a: '立即生效。' },
  { q: '会员资格可以跨设备使用吗？', a: '可以，使用会员key或身份二维码即可登录' },
  { q: '购买后可以取消或退款吗？', a: '如当前网站存在欺诈行为，可以联系平台客服退款，其他情况不能退款。退款请提供开通会员的网站地址、订单号、支付时间及说明退款原因。' },
]

/** copy 分段解析:逐字段回落内置默认;benefits ≤8 条、每行 ≤120 截断;faq ≤8×(q≤80/a≤300) */
export function resolvePricingCopy(
  copy: SiteMembershipCopy | null | undefined
): { intro: string; benefits: string[]; guarantee: string; faq: { q: string; a: string }[] } {
  const intro =
    typeof copy?.intro === 'string' && copy.intro.trim()
      ? copy.intro.trim()
      : PRICING_INTRO_TEXT
  const rawBenefits = copy?.benefits
  const sourceBenefits =
    Array.isArray(rawBenefits) &&
    rawBenefits.some((item) => typeof item === 'string' && item.trim())
      ? rawBenefits
      : [...PRICING_BENEFIT_ITEMS]
  const benefits = sourceBenefits
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
    .map((item) => item.slice(0, PRICING_COPY_BENEFIT_ITEM_MAX))
    .slice(0, PRICING_COPY_BENEFIT_MAX_ITEMS)
  const guarantee =
    typeof copy?.guarantee === 'string' && copy.guarantee.trim()
      ? copy.guarantee.trim()
      : PRICING_GUARANTEE_TEXT
  const rawFaq = copy?.faq
  const sourceFaq: ReadonlyArray<{ q: string; a: string }> =
    Array.isArray(rawFaq) &&
    rawFaq.some((item) => !!item && typeof item.q === 'string' && item.q.trim() && typeof item.a === 'string' && item.a.trim())
      ? rawFaq
      : PRICING_FAQ_DEFAULT
  const faq = sourceFaq
    .map((item) => ({
      q: typeof item?.q === 'string' ? item.q.trim().slice(0, PRICING_COPY_FAQ_Q_MAX) : '',
      a: typeof item?.a === 'string' ? item.a.trim().slice(0, PRICING_COPY_FAQ_A_MAX) : '',
    }))
    .filter((item) => item.q.length > 0 && item.a.length > 0)
    .slice(0, PRICING_COPY_FAQ_MAX_ITEMS)
  return { intro, benefits, guarantee, faq }
}

type SessionView = 'probing' | 'guest' | 'active' | 'expired'

function resolveStoreUrl(): string {
  if (typeof process === 'undefined') return ''
  return (process.env.NEXT_PUBLIC_STORE_URL || '').trim().replace(/\/+$/, '')
}

/** R6-6:FAQ 折叠箭头(展开=rotate-180;沿用内联图标先例) */
const FaqChevronIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
)

export function PricingPageContent({
  membership,
}: {
  membership: SiteMembershipConfig
}) {
  const router = useRouter()
  const activeTheme = useActiveTheme()
  const [view, setView] = useState<SessionView>('probing')
  const [loginOpen, setLoginOpen] = useState(false)
  const [renewDays, setRenewDays] = useState<number | null>(null)
  const [renewError, setRenewError] = useState('')
  const [renewErrorDays, setRenewErrorDays] = useState<number | null>(null)
  // R6-6:FAQ 逐条独立开合(默认全收起;点开不关其它)
  const [faqOpen, setFaqOpen] = useState<Record<number, boolean>>({})

  // R2-B5a R2:handoff 失败落点提示行(一次性;query 清除后不再显示)
  const showHandoffFailed =
    router.isReady && router.query?.handoff === 'failed'

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
  // R13:等级卡样式(读 copy.cardStyle;非法/缺省=default)
  const cardStyle = resolvePricingCardStyle(membership.copy?.cardStyle)
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
  // R4-B3:CTA 统一红底;R5-B1:皇冠改实心金 #FACC15
  // R6-4:tweet 全局 a{color:inherit}(0,1,2)压制锚点文字色,CTA 文字色须前缀式 important
  // R13(2B):按钮随风格自带配色(纯平色零渐变) —— default 红 / ice 冰蓝 / prism 紫 / modern 黑(暗态反白)
  const ctaButtonCls =
    cardStyle === 'ice'
      ? 'bg-[#2b7fd0] hover:bg-[#236fc0]'
      : cardStyle === 'prism'
        ? 'bg-[#8b5cf6] hover:bg-[#7a4de8]'
        : cardStyle === 'modern'
          ? panelTheme === 'dark'
            ? 'bg-[#f5f5f5] hover:bg-white'
            : panelTheme === 'light'
              ? 'bg-[#111] hover:bg-black'
              : 'bg-[#111] hover:bg-black dark:bg-[#f5f5f5] dark:hover:bg-white'
          : 'bg-[#dc2626] hover:bg-[#b91c1c]'
  const ctaTextCls =
    cardStyle === 'modern'
      ? panelTheme === 'dark'
        ? '!text-black'
        : panelTheme === 'light'
          ? '!text-white'
          : '!text-white dark:!text-black'
      : '!text-white'
  // R6-5:步骤图例连接线(细实线,禁虚线;三态主题)
  const guideLineCls =
    panelTheme === 'dark'
      ? 'bg-neutral-700'
      : panelTheme === 'light'
        ? 'bg-neutral-200'
        : 'bg-neutral-200 dark:bg-neutral-700'
  // R6-FAQ:FAQ 折叠行 hover 底色(三态主题;轻微提亮,替换原整块实色)
  const faqRowHoverCls =
    panelTheme === 'dark'
      ? 'hover:bg-white/5'
      : panelTheme === 'light'
        ? 'hover:bg-black/[0.03]'
        : 'hover:bg-black/[0.03] dark:hover:bg-white/5'

  // R6-FAQ:FAQ 问题/答案细分隔线色(三态主题;细实线1px)
  const faqDividerCls =
    panelTheme === 'dark'
      ? 'border-white/10'
      : panelTheme === 'light'
        ? 'border-black/[0.07]'
        : 'border-black/[0.07] dark:border-white/10'

  const storeUrl = resolveStoreUrl()
  const pricingCopy = resolvePricingCopy(membership.copy)

  const renderCta = (sku: string, days: number) => {
    if (view === 'expired') {
      const busy = renewDays === days
      return (
        <button
          type="button"
          onClick={() => void requestRenew(days)}
          disabled={busy}
          className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold ${ctaTextCls} transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${ctaButtonCls}`}
        >
          <span className="relative inline-flex items-center justify-center">
            <CrownIcon className="absolute right-full top-1/2 -translate-y-1/2 mr-1.5 h-3.5 w-3.5 shrink-0 text-[#FACC15]" />
            <span>{busy ? '跳转中…' : '续费'}</span>
          </span>
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
          className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold ${ctaTextCls} transition-all active:scale-[0.98] ${ctaButtonCls}`}
        >
          <span className="relative inline-flex items-center justify-center">
            <CrownIcon className="absolute right-full top-1/2 -translate-y-1/2 mr-1.5 h-3.5 w-3.5 shrink-0 text-[#FACC15]" />
            <span>立即购买</span>
          </span>
        </a>
      )
    }
    // guest(含 probing;R1 直达化:主按钮「立即购买」直链同窗;R5-B3 删登录次级行,单钮与 active 同构)
    return (
      <a
        href={storeUrl ? `${storeUrl}/p/${sku}?go=1` : '#'}
        onClick={(e) => {
          if (!storeUrl) e.preventDefault()
        }}
        className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold ${ctaTextCls} transition-all active:scale-[0.98] ${ctaButtonCls}`}
      >
        <span className="relative inline-flex items-center justify-center">
          <CrownIcon className="absolute right-full top-1/2 -translate-y-1/2 mr-1.5 h-3.5 w-3.5 shrink-0 text-[#FACC15]" />
          <span>立即购买</span>
        </span>
      </a>
    )
  }

  return (
    <div
      className="flex flex-col gap-8 py-2"
      data-pricing-panel={panelTheme}
      data-pricing-card-style={cardStyle}
    >
      {/* 页头:标题 + 说明段(copy 分段,缺省回落内置默认) */}
      <div>
        <h2 className={`text-lg font-semibold ${titleCls}`}>会员说明</h2>
        <p className={`mt-2 text-sm leading-relaxed ${mutedCls}`}>
          {pricingCopy.intro}
        </p>
      </div>

      {/* R6-5:步骤图例(纯指引不可点;Q2=B 无编号纯文字+连接线) */}
      <div className={`flex items-center gap-3 text-xs ${mutedCls}`}>
        <span className="shrink-0">选择方案</span>
        <span aria-hidden="true" className={`h-px flex-1 ${guideLineCls}`} />
        <span className="shrink-0">付费方式</span>
      </div>

      {showHandoffFailed ? (
        <p
          className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${cardCls} ${mutedCls}`}
          role="status"
        >
          {MEMBER_HANDOFF_FAILED_TEXT}
          <button
            type="button"
            onClick={() => setLoginOpen(true)}
            className="ml-1 font-medium underline transition-colors hover:opacity-80"
          >
            登录
          </button>
        </p>
      ) : null}

      {/* 档位/权益卡组 */}
      {membership.plans.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {membership.plans.map((plan) => (
            <div
              key={plan.sku}
              className={`pricing-card pricing-card--${cardStyle} flex flex-col gap-4 rounded-2xl border p-5 ${cardStyle === 'default' ? cardCls : ''}`}
            >
              <div className="pricing-card-head flex items-baseline justify-between gap-3">
                <span className={`pricing-tier text-sm font-medium ${titleCls}`}>
                  {formatMembershipTierLabel(plan.days)}
                </span>
                <span className={`pricing-price text-2xl font-extrabold ${priceCls}`}>
                  ¥{plan.price}
                </span>
              </div>
              <ul className="pricing-benefits flex flex-col gap-1.5">
                {pricingCopy.benefits.map((item, index) => (
                  <li key={`${index}-${item}`} className={`pricing-benefit-item flex items-start gap-2 text-xs leading-relaxed ${mutedCls}`}>
                    <span aria-hidden="true" className="pricing-benefit-mark">
                      {cardStyle === 'ice' ? null : cardStyle === 'prism' ? '✦' : cardStyle === 'modern' ? '–' : '·'}
                    </span>
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

      {/* R6-6:FAQ 折叠块(默认 5 组;全收起、逐条独立开合;禁裸 ul/li) */}
      <div className="flex flex-col gap-3">
        <h3 className={`text-base font-semibold ${titleCls}`}>{PRICING_FAQ_TITLE_TEXT}</h3>
        {pricingCopy.faq.map((item, index) => {
          const open = faqOpen[index] === true
          const panelId = `pricing-faq-panel-${index}`
          return (
            <div key={`${index}-${item.q}`} className={`rounded-2xl border ${cardCls}`}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setFaqOpen((prev) => ({ ...prev, [index]: !open }))}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left transition-colors ${faqRowHoverCls}`}
              >
                <span className={`text-sm font-medium ${titleCls}`}>{item.q}</span>
                <FaqChevronIcon className={`h-4 w-4 shrink-0 ${mutedCls} transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
              </button>
              <div id={panelId} hidden={!open} className={`border-t px-5 pt-3 pb-4 text-sm leading-relaxed ${faqDividerCls} ${mutedCls}`}>
                {item.a}
              </div>
            </div>
          )
        })}
      </div>

      {/* 保障说明块 */}
      <p className={`text-xs leading-relaxed ${mutedCls}`}>
        {pricingCopy.guarantee}
      </p>

      <MemberLoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />

      <style jsx>{`
        /* ===== R13 等级卡样式(仅作用于档位卡组;FAQ 与其它卡面保持默认外观) ===== */
        .pricing-card--ice,
        .pricing-card--prism,
        .pricing-card--modern {
          position: relative;
        }
        .pricing-card--ice {
          overflow: hidden;
        }
        .pricing-card--ice::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: var(--pc-sheen, transparent);
        }
        [data-pricing-panel='light'] .pricing-card--ice,
        [data-pricing-panel='auto'] .pricing-card--ice {
          --pc-sheen: radial-gradient(150px 95px at 88% -12%, rgba(140, 205, 255, 0.34), transparent 66%);
          --pc-price: linear-gradient(92deg, #2b7fd0, #38bdf8);
          --pc-tier: #5f7488;
          --pc-li: #64748b;
          --pc-mark: linear-gradient(135deg, #8fd0fa, #4a9fe8);
          background: linear-gradient(168deg, #fcfeff 0%, #f3f9ff 52%, #e9f4ff 100%);
          border-color: #d3e7fb;
          box-shadow: 0 12px 28px -14px rgba(43, 127, 255, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.95);
        }
        [data-pricing-panel='dark'] .pricing-card--ice,
        :global(.dark) [data-pricing-panel='auto'] .pricing-card--ice {
          --pc-sheen: radial-gradient(150px 95px at 88% -12%, rgba(90, 170, 240, 0.2), transparent 66%);
          --pc-price: linear-gradient(92deg, #8ed2f7, #59a8f2);
          --pc-tier: #9fb8cc;
          --pc-li: #8ba7bd;
          --pc-mark: linear-gradient(135deg, #6db9ee, #3d8bdc);
          background: linear-gradient(168deg, #16222e 0%, #0f1826 100%);
          border-color: #24405a;
          box-shadow: 0 12px 30px -16px rgba(56, 189, 248, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.07);
        }
        .pricing-card--ice .pricing-tier {
          color: var(--pc-tier);
        }
        .pricing-card--ice .pricing-benefit-item {
          color: var(--pc-li);
        }
        .pricing-card--ice .pricing-benefit-mark {
          width: 6px;
          height: 6px;
          border-radius: 1.5px;
          transform: rotate(45deg);
          margin-top: 6px;
          flex-shrink: 0;
          background: var(--pc-mark);
        }
        [data-pricing-panel='light'] .pricing-card--prism,
        [data-pricing-panel='auto'] .pricing-card--prism {
          --pc-prism-bg: radial-gradient(3px 3px at 84% 16%, rgba(255, 160, 232, 0.9), transparent 100%),
            radial-gradient(2.4px 2.4px at 90% 30%, rgba(150, 190, 255, 0.85), transparent 100%),
            radial-gradient(2.2px 2.2px at 78% 26%, rgba(190, 150, 255, 0.8), transparent 100%),
            linear-gradient(170deg, #fffdfe, #fbf7ff) padding-box,
            conic-gradient(from 200deg at 50% 50%, #ffc6e3, #c4adff, #a8dcff, #c9e9ff, #ffd9ae, #ffc6e3) border-box;
          --pc-price: linear-gradient(92deg, #8b5cf6, #ec4899, #06b6d4);
          --pc-tier: #7a7290;
          --pc-li: #6f6885;
          --pc-mark-color: #b98cf5;
          box-shadow: 0 12px 30px -14px rgba(167, 139, 250, 0.42);
        }
        [data-pricing-panel='dark'] .pricing-card--prism,
        :global(.dark) [data-pricing-panel='auto'] .pricing-card--prism {
          --pc-prism-bg: radial-gradient(3px 3px at 84% 16%, rgba(255, 150, 235, 0.9), transparent 100%),
            radial-gradient(2.4px 2.4px at 90% 30%, rgba(140, 190, 255, 0.85), transparent 100%),
            radial-gradient(2.2px 2.2px at 78% 26%, rgba(190, 160, 255, 0.75), transparent 100%),
            linear-gradient(170deg, #17131f, #100d18) padding-box,
            conic-gradient(from 200deg at 50% 50%, #8f7bff, #e879c9, #5fd0e8, #ffd479, #f5c46b, #8f7bff) border-box;
          --pc-price: linear-gradient(92deg, #a78bfa, #f472b6, #67e8f9);
          --pc-tier: #b0a6c9;
          --pc-li: #a79fc0;
          --pc-mark-color: #c4a6ff;
          box-shadow: 0 12px 32px -16px rgba(149, 115, 255, 0.4);
        }
        .pricing-card--prism {
          border-color: transparent;
          background: var(--pc-prism-bg, #fff);
        }
        .pricing-card--prism .pricing-tier {
          color: var(--pc-tier);
        }
        .pricing-card--prism .pricing-benefit-item {
          color: var(--pc-li);
        }
        .pricing-card--prism .pricing-benefit-mark {
          color: var(--pc-mark-color);
        }
        [data-pricing-panel='light'] .pricing-card--modern,
        [data-pricing-panel='auto'] .pricing-card--modern {
          --pc-bg: #ffffff;
          --pc-bd: #ececec;
          --pc-tier: #8a8a8a;
          --pc-price-color: #0a0a0a;
          --pc-li: #6b7280;
          --pc-mark-color: #b6bac2;
          --pc-hr: #f0f0f0;
        }
        [data-pricing-panel='dark'] .pricing-card--modern,
        :global(.dark) [data-pricing-panel='auto'] .pricing-card--modern {
          --pc-bg: #101012;
          --pc-bd: #242428;
          --pc-tier: #8b8b90;
          --pc-price-color: #fafafa;
          --pc-li: #9ca3af;
          --pc-mark-color: #b6bac2;
          --pc-hr: #232327;
        }
        .pricing-card.pricing-card--modern {
          border-radius: 12px;
          background: var(--pc-bg);
          border-color: var(--pc-bd);
          box-shadow: none;
        }
        .pricing-card--modern .pricing-tier {
          font-size: 13px;
          letter-spacing: 0.12em;
          font-weight: 600;
          color: var(--pc-tier);
        }
        .pricing-card--modern .pricing-price {
          font-size: 30px;
          color: var(--pc-price-color);
        }
        .pricing-card--modern .pricing-card-head {
          border-bottom: 1px solid var(--pc-hr);
          padding-bottom: 12px;
        }
        .pricing-card--modern .pricing-benefit-item {
          color: var(--pc-li);
        }
        .pricing-card--modern .pricing-benefit-mark {
          color: var(--pc-mark-color);
        }
        .pricing-card--ice .pricing-price,
        .pricing-card--prism .pricing-price {
          background: var(--pc-price);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
        }
      `}</style>
    </div>
  )
}
