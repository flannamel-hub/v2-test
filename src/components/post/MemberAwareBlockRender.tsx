'use client'

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { BlockRender } from '@/src/components/blocks/BlockRender'
import { MemberContentGate } from '@/src/components/post/MemberContentGate'
import { splitBlocksOnMemberMarker } from '@/src/lib/blog/memberContent'
import type { SiteMembershipConfig } from '@/src/lib/blog/membershipGate'
import type { BlockResponse } from '@/src/types/notion'

/**
 * 站点会员 B2:渲染接线组件 + Context Provider。
 * - MemberContentProvider 由文章页([post].tsx)包裹主题树,下发
 *   { enabled(本文是否含会员区), slug, config(页 props membershipConfig) };
 * - MemberAwareBlockRender 替换三主题内容组件的 <BlockRender> 直调;
 * - Context 缺省(未包裹)= 不渲染 gate、原样渲染——向后兼容。
 */

export type MemberContentContextValue = {
  enabled: boolean
  slug: string
  config: SiteMembershipConfig | null
}

const MemberContentContext = createContext<MemberContentContextValue | null>(null)

export function MemberContentProvider({
  value,
  children,
}: {
  value: MemberContentContextValue
  children: ReactNode
}) {
  return (
    <MemberContentContext.Provider value={value}>
      {children}
    </MemberContentContext.Provider>
  )
}

export function useMemberContent(): MemberContentContextValue | null {
  return useContext(MemberContentContext)
}

export function MemberAwareBlockRender({
  blocks,
  variant,
  postSlug,
}: {
  blocks: BlockResponse[]
  variant: 'default' | 'gallery' | 'tweet'
  postSlug: string
}) {
  // 防御性再切分:服务端已剥离,正常情况 memberBlocks 必为空;
  // 异常非空(开发期回归)只渲染 publicBlocks 并 console.warn(不带内容原文)
  const { publicBlocks, memberBlocks } = splitBlocksOnMemberMarker(blocks)
  const ctx = useMemberContent()
  if (memberBlocks.length > 0) {
    console.warn('[MemberAwareBlockRender] unexpected member blocks dropped')
  }
  return (
    <>
      <BlockRender blocks={publicBlocks} variant={variant} />
      {ctx?.enabled ? <MemberContentGate postSlug={postSlug} variant={variant} /> : null}
    </>
  )
}
