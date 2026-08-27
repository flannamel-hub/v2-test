import Footer from './footer/Footer'
import Navbar from './nav/Navbar'
import { SitePopups } from './widget/SitePopups'
import { ThemeNavShell } from '@/src/themes/themeLayout'
import { isTweetTheme } from '@/src/themes/tweet/tweetTheme'
import { ShopNavbar } from '@/src/themes/shop/ShopNavbar'
import { ShopSiteProvider, ShopSiteTitleProvider } from '@/src/themes/shop/ShopSiteContext'
import { SiteBrandProvider, SitePlanProvider } from '@/src/components/theme/SitePlanContext'
import { Page, SharedNavFooterStaticProps } from '@/src/types/blog'

function resolveSocialLinks(widgets: unknown) {
  if (!widgets || typeof widgets !== 'object') return null
  const data = widgets as Record<string, any>
  const socialWidget = data['social-links']
  if (socialWidget?.enabled !== false && Array.isArray(socialWidget?.links)) {
    return socialWidget
  }
  const profileLinks = data.profile?.links
  return Array.isArray(profileLinks) ? { enabled: true, links: profileLinks } : null
}

export default function withNavFooter(
  WrappedComponent: any,
  pureFooter?: boolean,
  showBeian?: boolean
) {
  return function WithNavFooterWrapper(
    props: SharedNavFooterStaticProps['props'] & { activeTheme?: string }
  ) {
    const themeId = props.activeTheme
    const socialLinks = resolveSocialLinks((props as any).widgets)
    const sitePlan = props.sitePlan === 'pro' ? 'pro' : 'free'
    // P8:去除平台角标(服务端已双条件收敛;缺省 false=展示平台标识)
    const siteBrandClean = props.siteBrandClean === true
    const siteName = (props.siteTitle?.text || '').trim()
    // P18-C2:shop 主题站点 ID(购物车 localStorage 分组 / 结算 URL site 参数)
    const shopSiteId = typeof props.shopSiteId === 'string' ? props.shopSiteId : ''
    const showShopCart = themeId === 'shop'
    if (themeId === 'gallery' || isTweetTheme(themeId)) {
      return (
        <SitePlanProvider plan={sitePlan}>
        <SiteBrandProvider brandClean={siteBrandClean} siteName={siteName}>
          <ShopSiteProvider siteId={shopSiteId}>
          <ShopSiteTitleProvider siteTitle={siteName}>
          <ThemeNavShell
            activeTheme={themeId}
            siteTitle={props.siteTitle}
            vendingConfig={props.vendingConfig}
            vendingEnabled={props.vendingEnabled !== false}
            socialLinks={socialLinks}
          >
            <WrappedComponent {...props} />
          </ThemeNavShell>
          <SitePopups
            announcementPopup={props.announcementPopup}
            popupAd={props.popupAd}
            clickAd={props.clickAd}
            activeTheme={themeId}
          />
          </ShopSiteTitleProvider>
          </ShopSiteProvider>
        </SiteBrandProvider>
        </SitePlanProvider>
      )
    }

    const items = props.navPages.filter(
      (item: Page) => item.status === 'Published'
    )

    return (
      <SitePlanProvider plan={sitePlan}>
        <SiteBrandProvider brandClean={siteBrandClean} siteName={siteName}>
          <ShopSiteProvider siteId={shopSiteId}>
          <ShopSiteTitleProvider siteTitle={siteName}>
          <main
            className={`flex flex-col justify-start min-h-screen${
              themeId === 'shop' ? ' pt-14' : ''
            }`}
          >
          {themeId === 'shop' ? (
            <ShopNavbar items={items} title={props.siteTitle} />
          ) : (
            <Navbar
              items={items}
              title={props.siteTitle}
              subtitle={
                props.enableNavSubtitle && props.siteSubtitle
                  ? props.siteSubtitle
                  : undefined
              }
              showCart={showShopCart}
            />
          )}
          <WrappedComponent {...props} />
          <div className="mt-auto">
            <Footer
              title={props.siteTitle}
              color={pureFooter ? 'pure' : undefined}
              showBeian={showBeian}
              logo={props.logo}
              socialLinks={themeId === 'shop' ? socialLinks?.links ?? null : undefined}
              wide={themeId === 'shop'}
              hideThemeSwitch={themeId === 'shop'}
              path={{
                text: props.siteSubtitle?.text ?? '',
                href: props.siteSubtitle?.slug ?? '',
              }}
            />
          </div>
          <SitePopups
            announcementPopup={props.announcementPopup}
            popupAd={props.popupAd}
            clickAd={props.clickAd}
            activeTheme={themeId}
          />
          </main>
          </ShopSiteTitleProvider>
          </ShopSiteProvider>
        </SiteBrandProvider>
      </SitePlanProvider>
    )
  }
}
