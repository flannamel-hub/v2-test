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
