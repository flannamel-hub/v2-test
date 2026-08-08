import Footer from './footer/Footer'
import Navbar from './nav/Navbar'
import { SitePopups } from './widget/SitePopups'
import { ThemeNavShell } from '@/src/themes/themeLayout'
import { isTweetTheme } from '@/src/themes/tweet/tweetTheme'
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
    if (themeId === 'gallery' || isTweetTheme(themeId)) {
      return (
        <>
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
        </>
      )
    }

    const items = props.navPages.filter(
      (item: Page) => item.status === 'Published'
    )

    return (
      <main className="flex flex-col justify-start min-h-screen">
        <Navbar
          items={items}
          title={props.siteTitle}
          subtitle={
            props.enableNavSubtitle && props.siteSubtitle
              ? props.siteSubtitle
              : undefined
          }
        />
        <WrappedComponent {...props} />
        <div className="mt-auto">
          <Footer
            title={props.siteTitle}
            color={pureFooter ? 'pure' : undefined}
            showBeian={showBeian}
            logo={props.logo}
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
    )
  }
}
