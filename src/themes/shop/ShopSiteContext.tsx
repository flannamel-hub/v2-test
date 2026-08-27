import { createContext, useContext } from 'react'

/**
 * P18-C2:shop 主题站点 ID 上下文。
 * withNavFooter 注入 getStaticProps 下发的 shopSiteId(服务端 BLOG_SITE_ID);
 * 购物车(localStorage 按 site_id 分组)与结算 URL 的 site 参数使用。
 * 未包裹的路由默认空字符串(本地开发降级,不阻断功能)。
 */

const ShopSiteContext = createContext('')

export function ShopSiteProvider({
  siteId,
  children,
}: {
  siteId: string
  children: React.ReactNode
}) {
  return <ShopSiteContext.Provider value={siteId}>{children}</ShopSiteContext.Provider>
}

export function useShopSiteId(): string {
  return useContext(ShopSiteContext)
}

/**
 * P18C44-B3 D5:shop 主题站点标题上下文(结算 URL 的 site_title 参数)。
 * withNavFooter 注入 getStaticProps 下发的 siteTitle.text;抽屉等深层组件
 * 无需逐层透传 props。未包裹的路由默认空字符串(不追加 site_title 参数)。
 */
const ShopSiteTitleContext = createContext('')

export function ShopSiteTitleProvider({
  siteTitle,
  children,
}: {
  siteTitle: string
  children: React.ReactNode
}) {
  return (
    <ShopSiteTitleContext.Provider value={siteTitle}>
      {children}
    </ShopSiteTitleContext.Provider>
  )
}

export function useShopSiteTitle(): string {
  return useContext(ShopSiteTitleContext)
}
