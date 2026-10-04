import { createContext, useContext } from 'react'
import type { SiteQuotaPlan } from '@/src/lib/blog/quotaState'
import type { SiteMembershipConfig } from '@/src/lib/blog/membershipGate'

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

/** BLOG 分层 P8:去除平台角标上下文(brand_clean 开关 + 站名,用于 footer 署名)。
 * 由 withNavFooter 注入(服务端已按 plan=pro && brand_clean 双条件收敛);
 * 未包裹的路由默认 false,平台标识保持展示(安全缺省)。 */

type SiteBrandContextValue = {
  brandClean: boolean
  siteName: string
}

const SiteBrandContext = createContext<SiteBrandContextValue>({
  brandClean: false,
  siteName: '',
})

export function SiteBrandProvider({
  brandClean,
  siteName,
  children,
}: {
  brandClean: boolean
  siteName: string
  children: React.ReactNode
}) {
  return (
    <SiteBrandContext.Provider value={{ brandClean, siteName }}>
      {children}
    </SiteBrandContext.Provider>
  )
}

export function useSiteBrand(): SiteBrandContextValue {
  return useContext(SiteBrandContext)
}

/** 去除平台角标生效判定:双条件(brand_clean && plan=pro),任一不满足即展示平台标识 */
export function useIsBrandCleanSite(): boolean {
  return useSitePlan() === 'pro' && useSiteBrand().brandClean
}

/** 站点会员 B4-W2(M1):会员导航上下文。
 * 由 withNavFooter 两分支外层注入(props.membershipConfig ?? null;服务端双门收敛,
 * 免费/未开通恒 null);导航级自包含组件(MemberNavEntries)自读 context,
 * 四主题导航文件零 props 改动。缺省 null = fail-closed 不渲染入口。 */

const MemberNavContext = createContext<SiteMembershipConfig | null>(null)

export function MemberNavProvider({
  config,
  children,
}: {
  config: SiteMembershipConfig | null
  children: React.ReactNode
}) {
  return (
    <MemberNavContext.Provider value={config}>
      {children}
    </MemberNavContext.Provider>
  )
}

export function useMemberNavConfig(): SiteMembershipConfig | null {
  return useContext(MemberNavContext)
}
