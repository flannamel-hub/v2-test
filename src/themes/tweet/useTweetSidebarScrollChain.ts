'use client'

import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * P18TWEETSCROLL tweet 右栏滚动接力(B+C 方案):
 * - 主文档滚到底后,滚轮(页面任意位置,不必悬停右栏)自动转右栏滚动;
 * - 向上滚:右栏先回顶,再恢复文档滚动;
 * - 右栏内容不超视口 / 移动端(右栏隐藏)→ 整段逻辑旁路,零干预;
 * - 组件卸载清理监听。
 * 判定所需的文档高度/右栏可滚量均在事件时刻实时求值(零缓存,不会读到陈旧状态)。
 */

export type TweetWheelDecision = 'pass' | 'sidebar-down' | 'sidebar-up'

export const TWEET_SCROLL_CHAIN_QUERY = '(min-width: 1024px)'
export const TWEET_DOC_BOTTOM_TOLERANCE = 2
export const TWEET_EDGE_EPSILON = 1

/** wheel 事件 delta 归一化为像素(deltaMode: 0=像素 1=行 2=页) */
export function normalizeTweetWheelDelta(
  deltaY: number,
  deltaMode: number,
  viewportPx: number
): number {
  if (deltaMode === 1) return deltaY * 16
  if (deltaMode === 2) return deltaY * Math.max(viewportPx, 1)
  return deltaY
}

/** 主文档是否已滚到底(容差默认 2px) */
export function isTweetDocAtBottom(
  scrollY: number,
  innerHeight: number,
  docScrollHeight: number,
  tolerance: number = TWEET_DOC_BOTTOM_TOLERANCE
): boolean {
  return Math.abs(scrollY + innerHeight - docScrollHeight) < tolerance
}

export type TweetWheelDecisionInput = {
  /** 桌面端(<1024px 右栏 display:none,移动端旁路) */
  desktop: boolean
  /** 右栏内容超视口(scrollHeight - clientHeight > 1),不超则纯 CSS 行为旁路 */
  sidebarOverflowing: boolean
  /** 光标在右栏内部(原生滚动行为等价,直接放行) */
  targetInsideSidebar: boolean
  /** 光标在其他可滚区域(左栏内部滚动等),不劫持其原生滚动 */
  targetInsideOtherScrollable: boolean
  /** ctrl+滚轮 = 缩放手势,放行 */
  ctrlKey: boolean
  docBottom: boolean
  deltaY: number
  /** 右栏剩余可下滚量 */
  sidebarRemainBelow: number
  sidebarAtTop: boolean
}

/** 滚动接力分支决策(与派工单伪码一一对应) */
export function resolveTweetWheelDecision(
  input: TweetWheelDecisionInput
): TweetWheelDecision {
  if (!input.desktop || !input.sidebarOverflowing) return 'pass'
  if (input.ctrlKey) return 'pass'
  if (input.targetInsideSidebar || input.targetInsideOtherScrollable) return 'pass'
  if (!input.docBottom) return 'pass'
  if (input.deltaY > 0 && input.sidebarRemainBelow > TWEET_EDGE_EPSILON) {
    return 'sidebar-down'
  }
  if (input.deltaY < 0 && !input.sidebarAtTop) return 'sidebar-up'
  return 'pass'
}

type NodeLike = { parentNode: unknown }

/** target 是否位于 root 内部(沿 parentNode 上行) */
export function isTweetNodeInside(target: unknown, root: unknown): boolean {
  let node: unknown = target
  while (node && typeof node === 'object') {
    if (node === root) return true
    node = (node as NodeLike).parentNode
  }
  return false
}

/** target 与 root 之间是否存在其他可滚元素(由 isScrollable 谓词判定) */
export function hasTweetScrollableAncestor(
  target: unknown,
  root: unknown,
  isScrollable: (el: unknown) => boolean
): boolean {
  let node: unknown = target
  while (node && typeof node === 'object' && node !== root) {
    if (isScrollable(node)) return true
    node = (node as NodeLike).parentNode
  }
  return false
}

export type TweetScrollChainHandle = { detach: () => void }

/**
 * 挂接滚动接力:window 上注册非 passive wheel 监听,返回 detach 清理函数。
 * 独立于 React 生命周期,便于直接冒烟测试。
 */
export function attachTweetSidebarScrollChain(
  win: Window,
  doc: Document,
  sidebar: HTMLElement
): TweetScrollChainHandle {
  const mq = win.matchMedia(TWEET_SCROLL_CHAIN_QUERY)

  const isOtherScrollable = (el: unknown): boolean => {
    if (!el || typeof el !== 'object') return false
    const tag = (el as HTMLElement).tagName
    if (typeof tag !== 'string') return false
    if (tag === 'HTML' || tag === 'BODY') return false
    const total = (el as HTMLElement).scrollHeight - (el as HTMLElement).clientHeight
    if (!Number.isFinite(total) || total <= TWEET_EDGE_EPSILON) return false
    const overflowY = win.getComputedStyle(el as HTMLElement).overflowY
    return overflowY === 'auto' || overflowY === 'scroll'
  }

  const onWheel = (e: WheelEvent) => {
    if (e.defaultPrevented) return
    const decision = resolveTweetWheelDecision({
      desktop: mq.matches,
      sidebarOverflowing:
        sidebar.scrollHeight - sidebar.clientHeight > TWEET_EDGE_EPSILON,
      targetInsideSidebar: isTweetNodeInside(e.target, sidebar),
      targetInsideOtherScrollable: hasTweetScrollableAncestor(
        e.target,
        sidebar,
        isOtherScrollable
      ),
      ctrlKey: e.ctrlKey,
      docBottom: isTweetDocAtBottom(
        win.scrollY,
        win.innerHeight,
        doc.documentElement.scrollHeight
      ),
      deltaY: e.deltaY,
      sidebarRemainBelow:
        sidebar.scrollHeight - sidebar.clientHeight - sidebar.scrollTop,
      sidebarAtTop: sidebar.scrollTop <= TWEET_EDGE_EPSILON,
    })
    if (decision === 'pass') return
    e.preventDefault()
    const delta = normalizeTweetWheelDelta(
      e.deltaY,
      e.deltaMode,
      sidebar.clientHeight
    )
    const maxScrollTop = sidebar.scrollHeight - sidebar.clientHeight
    sidebar.scrollTop =
      decision === 'sidebar-down'
        ? Math.min(sidebar.scrollTop + delta, maxScrollTop)
        : Math.max(sidebar.scrollTop + delta, 0)
  }

  win.addEventListener('wheel', onWheel, { passive: false })
  return {
    detach: () => {
      win.removeEventListener('wheel', onWheel)
    },
  }
}

/** React hook:右栏滚动容器(overflow-y:auto 的 .tweet-feed__right-inner)ref 接线 */
export function useTweetSidebarScrollChain(
  sidebarRef: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    const sidebar = sidebarRef.current
    if (!sidebar) return
    const handle = attachTweetSidebarScrollChain(window, document, sidebar)
    return () => handle.detach()
  }, [sidebarRef])
}
