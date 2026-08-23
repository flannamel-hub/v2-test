import { SharedNavFooterStaticProps } from '@/src/types/blog'
import { GetStaticPropsContext } from 'next'
import { resolveActiveTheme } from '@/src/themes/getActiveTheme'
import { getAnnouncementPopupConfig } from '@/src/lib/blog/announcementPopupSettings'
import { getClickAdConfig } from '@/src/lib/blog/clickAdSettings'
import { getPopupAdConfig } from '@/src/lib/blog/popupAdSettings'
import { getVendingConfig } from '@/src/lib/blog/vendingSettings'
import { DEFAULT_VENDING_URL } from '@/src/lib/blog/vendingDefaults'
import { getSiteQuotaState } from '@/src/lib/blog/quotaState'
import { isFreeAdGraceActive } from '@/src/lib/blog/freeTierGrace'
import { getCachedNavFooter } from '../notion/getCachedMem'
import { getWidgetPages } from '../notion/getDatabase'
import { isTransientNotionError, isNotionBuildPhase } from '../notion/transientErrors'
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import type { ClickAdConfig } from '@/src/lib/blog/clickAdDefaults'
import type { PopupAdConfig } from '@/src/lib/blog/popupAdDefaults'
import { getImageHostConfig } from '@/src/lib/media/imageHostConfig'

export type SharedNavFooterNotionData = {
  widgetPages: PageObjectResponse[]
}

/** 广告 widget 是否有商户存量配置:Notion widget 页存在(非默认值);
 * 与 createDefault*Config 的 source='default'/id=null 判定一致 */
function hasExistingAdWidget(
  config: PopupAdConfig | ClickAdConfig | null | undefined
): boolean {
  return config?.source === 'notion' && Boolean(config.id)
}

async function buildSharedProps(
  navPages: SharedNavFooterStaticProps['props']['navPages'],
  siteTitle: SharedNavFooterStaticProps['props']['siteTitle'],
  logo: SharedNavFooterStaticProps['props']['logo'],
  widgetPages: PageObjectResponse[]
): Promise<SharedNavFooterStaticProps['props']> {
  const [activeTheme, vendingConfig, announcementPopup, popupAdRaw, clickAdRaw, quotaState] =
    await Promise.all([
      resolveActiveTheme(),
      getVendingConfig(widgetPages),
      getAnnouncementPopupConfig(widgetPages),
      getPopupAdConfig(widgetPages),
      getClickAdConfig(widgetPages),
      getSiteQuotaState(),
    ])

  // BLOG 分层 P4:免费版贩售机强制平台默认地址;专业版保留商户自定义
  const vendingConfigForPlan =
    quotaState.plan === 'pro'
      ? vendingConfig
      : { ...vendingConfig, url: DEFAULT_VENDING_URL }

  // BLOG 分层 P4 广告位:专业版照常;免费版仅过渡期内保留存量配置(非默认值)
  const freeAdsVisible = isFreeAdGraceActive()
  const popupAd =
    quotaState.plan === 'pro' || (freeAdsVisible && hasExistingAdWidget(popupAdRaw))
      ? popupAdRaw
      : null
  const clickAd =
    quotaState.plan === 'pro' || (freeAdsVisible && hasExistingAdWidget(clickAdRaw))
      ? clickAdRaw
      : null

  return {
    navPages,
    siteTitle,
    siteSubtitle: null,
    logo,
    activeTheme,
    sitePlan: quotaState.plan,
    vendingConfig: vendingConfigForPlan,
    vendingEnabled: vendingConfigForPlan.enabled,
    announcementPopup,
    popupAd,
    clickAd,
  }
}

export function withNavFooterStaticProps(
  getStaticPropsFunc?: (
    context: GetStaticPropsContext,
    sharedPageStaticProps: SharedNavFooterStaticProps,
    sharedNotionData: SharedNavFooterNotionData
  ) => Promise<SharedNavFooterStaticProps>
) {
  return async (
    context: GetStaticPropsContext
  ): Promise<SharedNavFooterStaticProps> => {
    // 先刷新全平台图床配置，后续 Notion/Gallery 格式化使用同一份 LKG。
    await getImageHostConfig()

    let navPages: SharedNavFooterStaticProps['props']['navPages'] = []
    let siteTitle: SharedNavFooterStaticProps['props']['siteTitle'] = {
      text: 'PRO BLOG',
      color: 'gray',
      slug: '/',
    }
    let logo: SharedNavFooterStaticProps['props']['logo'] = null

    try {
      const nav = await getCachedNavFooter()
      navPages = nav.navPages
      siteTitle = nav.siteTitle
      logo = nav.logo
    } catch (error) {
      if (!isTransientNotionError(error) || !isNotionBuildPhase()) throw error
      console.warn(
        '[withNavFooterStaticProps] nav load failed during build, using fallback:',
        error instanceof Error ? error.message : error
      )
    }

    let widgetPages: PageObjectResponse[] = []
    try {
      widgetPages = await getWidgetPages()
    } catch (error) {
      if (!isTransientNotionError(error) || !isNotionBuildPhase()) throw error
      console.warn(
        '[withNavFooterStaticProps] widget load failed during build, using fallback:',
        error instanceof Error ? error.message : error
      )
    }

    const sharedProps = await buildSharedProps(
      navPages,
      siteTitle,
      logo,
      widgetPages
    )

    if (getStaticPropsFunc == null) {
      return { props: sharedProps }
    }

    const result = await getStaticPropsFunc(
      context,
      { props: sharedProps },
      { widgetPages }
    )
    if (result && 'props' in result && result.props) {
      // 复用 sharedProps.activeTheme（getRemoteTheme 已进程内缓存）；仅在页面显式覆盖时再解析
      const pageTheme = result.props.activeTheme as string | undefined
      if (pageTheme && pageTheme !== sharedProps.activeTheme) {
        result.props.activeTheme = await resolveActiveTheme(pageTheme)
      } else {
        result.props.activeTheme = sharedProps.activeTheme
      }
    }
    return result
  }
}
