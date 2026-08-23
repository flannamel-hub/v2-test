import { createContext, useContext } from 'react'
import type { SiteQuotaPlan } from '@/src/lib/blog/quotaState'

/** BLOG 分层 P4:站点会员计划上下文。
 * withNavFooter 包裹全部公开页面并注入 getStaticProps 里的 sitePlan;
 * 未包裹(如后台路由)默认 free,平台标识保持展示(安全缺省)。 */

const SitePlanContext = createContext<SiteQuotaPlan>('free')

export function SitePlanProvider({
  plan,
  children,
}: {
  plan: SiteQuotaPlan
  children: React.ReactNode
}) {
  return <SitePlanContext.Provider value={plan}>{children}</SitePlanContext.Provider>
}

export function useSitePlan(): SiteQuotaPlan {
  return useContext(SitePlanContext)
}

/** 专业版隐藏平台标识;上下文缺失或读取失败按 free 处理(展示标识) */
export function useIsProSite(): boolean {
  return useSitePlan() === 'pro'
}
