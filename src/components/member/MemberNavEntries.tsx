'use client'

import Link from 'next/link'
import React, { useState } from 'react'
import { MemberLoginDialog } from '@/src/components/member/MemberLoginDialog'
import { useMemberNavConfig } from '@/src/components/theme/SitePlanContext'

/**
 * 站点会员 B4-W2(M1):四主题导航「会员」+「登录」双入口。
 * - 仅当 Context membershipConfig 存在(enabled;服务端双门收敛)时渲染,缺省 null 不渲染;
 * - 「会员」= Link /member;「登录」= button 打开全局 MemberLoginDialog;
 * - 不做在线状态感知(SSG 友好;已登录态由弹窗内轻态承担);
 * - variant 贴各主题灰阶/现有按钮语言;无 emoji、功能化纯文字。
 */

export type MemberNavVariant =
  | 'standard'
  | 'standard-mobile'
  | 'shop'
  | 'gallery'
  | 'tweet'
  | 'tweet-mobile'

const TWEET_ENTRY_BASE =
  'text-[1rem] leading-6 text-[color:var(--tweet-muted)] hover:text-[color:var(--tweet-gray12)] cursor-pointer'

export function MemberNavEntries({ variant }: { variant: MemberNavVariant }) {
  const config = useMemberNavConfig()
  const [loginOpen, setLoginOpen] = useState(false)
  if (!config) return null

  const openDialog = () => setLoginOpen(true)

  let memberEntry: React.ReactNode = null
  let loginEntry: React.ReactNode = null

  if (variant === 'standard' || variant === 'standard-mobile') {
    // Navbar 右区/移动折叠区:贴 NavItem 文字语言(黑/白灰阶)
    const base =
      variant === 'standard'
        ? 'flex h-12 items-center justify-center whitespace-nowrap text-sm text-neutral-500 transition-colors hover:text-black dark:text-neutral-400 dark:hover:text-white'
        : 'flex h-10 items-center justify-center rounded-2xl bg-white bg-opacity-80 px-4 text-sm text-neutral-600 shadow-[0px_0px_14px_-5px_rgb(186_186_186/70%)] transition-all hover:scale-105 hover:bg-opacity-100 dark:bg-neutral-900 dark:bg-opacity-80 dark:text-neutral-300 sm:h-24'
    memberEntry = (
      <Link href="/member" className={base}>
        会员
      </Link>
    )
    loginEntry = (
      <button type="button" onClick={openDialog} className={base}>
        登录
      </button>
    )
  } else if (variant === 'shop') {
    // ShopNavbar 右区:ghost 动作按钮(查单/购物车同款)
    const base =
      'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-900/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white'
    memberEntry = (
      <Link href="/member" className={base}>
        会员
      </Link>
    )
    loginEntry = (
      <button type="button" onClick={openDialog} className={base}>
        登录
      </button>
    )
  } else if (variant === 'gallery') {
    // GallerySidebar 底部区:贴侧栏灰阶文字按钮
    const base =
      'flex-1 rounded-md border border-neutral-200 py-2 text-center text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900'
    memberEntry = (
      <Link href="/member" className={base}>
        会员
      </Link>
    )
    loginEntry = (
      <button type="button" onClick={openDialog} className={base}>
        登录
      </button>
    )
  } else {
    // tweet(桌面 Header 右区) / tweet-mobile(移动展开面板):CSS 变量灰阶,零新 CSS
    memberEntry = (
      <Link href="/member" className={TWEET_ENTRY_BASE}>
        会员
      </Link>
    )
    loginEntry = (
      <button type="button" onClick={openDialog} className={TWEET_ENTRY_BASE}>
        登录
      </button>
    )
  }

  const dialog = (
    <MemberLoginDialog open={loginOpen} onClose={() => setLoginOpen(false)} />
  )

  if (variant === 'tweet-mobile') {
    // 移动展开面板:两入口同行排列
    return (
      <>
        <div className="flex items-center gap-4 px-0.5 pt-1">
          {memberEntry}
          {loginEntry}
        </div>
        {dialog}
      </>
    )
  }

  if (variant === 'gallery') {
    // 侧栏底部区:两入口同行等宽
    return (
      <>
        <div className="flex items-stretch gap-2">
          {memberEntry}
          {loginEntry}
        </div>
        {dialog}
      </>
    )
  }

  return (
    <>
      {memberEntry}
      {loginEntry}
      {dialog}
    </>
  )
}
