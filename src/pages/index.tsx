import CONFIG from '@/blog.config'
import { GetStaticProps, GetStaticPropsContext, NextPage } from 'next'
import BlogLayout from '../components/layout/BlogLayout'
import withNavFooter from '../components/withNavFooter'
import { applyThemePageLayout } from '../themes/themeLayout'
import { formatPosts, FORMAT_POST_LIST_OPTIONS } from '../lib/blog/format/post'
import { loadHomeWidgets } from '../lib/blog/loadHomeWidgets'
import { withNavFooterStaticProps } from '../lib/blog/withNavFooterStaticProps'
import type { SharedNavFooterNotionData } from '../lib/blog/withNavFooterStaticProps'
import { buildHomeFeedPosts } from '../lib/blog/postLimits'
import { ANNOUNCEMENT_SLUG } from '../lib/blog/pinnedPosts'
import { getAnnouncementPost } from '../lib/blog/loadHomeWidgets'
import { getPosts } from '../lib/notion/getBlogData'
import { NextPageWithLayout, Post, SharedNavFooterStaticProps } from '../types/blog'
import { ApiScope } from '../types/notion'
import { buildHomePageSeo } from '../lib/seo/lightSeo'
import { isTweetTheme } from '@/src/themes/tweet/tweetTheme'
import { loadGalleryFeedCovers } from '@/src/lib/gallery/galleryFeedPreviews'
import { shouldLoadGalleryFeedCovers } from '@/src/lib/gallery/shouldLoadGalleryFeedCovers'
import { loadTweetFeedMedia } from '../lib/tweet/loadTweetFeedMedia'
import { themeFromEnv } from '@/src/themes/getActiveTheme'
import { isShopTheme } from '@/src/themes/shop/shopTheme'
import { getShopBannerConfig } from '@/src/lib/blog/shopBannerSettings'
import { getThemeHomeComponent } from '../themes/registry'
import { ThemeId } from '../themes/types'

const Home: NextPage<{
  posts: Post[]
  widgets: { [key: string]: unknown }
  activeTheme: ThemeId
  tweetFeedMedia?: import('../lib/tweet/loadTweetFeedMedia').TweetFeedMediaMap | null
  galleryFeedCovers?: Record<string, string> | null
  shopBanner?: import('@/src/lib/blog/shopBannerDefaults').ShopBannerConfig | null
}> = ({ posts, widgets, activeTheme, siteTitle, navPages, tweetFeedMedia, galleryFeedCovers, vendingConfig, vendingEnabled, shopBanner }) => {
  const themeId =
    activeTheme ||
    (process.env.NODE_ENV === 'development' ? themeFromEnv() : null) ||
    'anzifan'
  const HomeView = getThemeHomeComponent(themeId)
  return (
    <HomeView
      posts={posts}
      widgets={widgets}
      siteTitle={siteTitle}
      navPages={navPages}
      tweetFeedMedia={tweetFeedMedia}
      galleryFeedCovers={galleryFeedCovers}
      vendingConfig={vendingConfig}
      vendingEnabled={vendingEnabled !== false}
      shopBanner={shopBanner ?? null}
    />
  )
}

export const getStaticProps: GetStaticProps = withNavFooterStaticProps(
  async (
    _context: GetStaticPropsContext,
    sharedPageStaticProps: SharedNavFooterStaticProps,
    sharedNotionData: SharedNavFooterNotionData
  ) => {
    try {
      const postsRaw = await getPosts(ApiScope.Archive)
      let allFormattedPosts = buildHomeFeedPosts(
        await formatPosts(postsRaw, FORMAT_POST_LIST_OPTIONS)
      )

      if (!allFormattedPosts || allFormattedPosts.length === 0) {
        const backupPosts = (sharedPageStaticProps.props.navPages as unknown as { type?: string; slug?: string }[]) || []
        allFormattedPosts = backupPosts.filter((p) => p.type === 'Post') as Post[]
      }

      let announcementPost =
        allFormattedPosts.find((p) => p.slug === ANNOUNCEMENT_SLUG) || null
      if (!announcementPost) {
        announcementPost = await getAnnouncementPost()
      }
      const filteredPosts = allFormattedPosts.filter(
        (p) => p.slug !== ANNOUNCEMENT_SLUG
      )

      const safeWidgets = await loadHomeWidgets({
        announcement: announcementPost,
      })

      const activeTheme = sharedPageStaticProps.props.activeTheme
      // P18-C4-1: shop 主题首页 Banner(复用 withNavFooterStaticProps 已拉取的 widgetPages)
      let shopBanner = null
      if (isShopTheme(activeTheme)) {
        try {
          shopBanner = await getShopBannerConfig(sharedNotionData?.widgetPages)
        } catch (bannerErr) {
          console.error('Index shopBanner load failed:', bannerErr)
        }
      }
      let tweetFeedMedia = null
      if (isTweetTheme(activeTheme)) {
        try {
          tweetFeedMedia = await loadTweetFeedMedia(filteredPosts)
        } catch (tweetMediaErr) {
          console.error('Index tweetFeedMedia load failed:', tweetMediaErr)
        }
      }
      let galleryFeedCovers = null
      if (shouldLoadGalleryFeedCovers(activeTheme)) {
        try {
          galleryFeedCovers = await loadGalleryFeedCovers(
            filteredPosts.map((p) => p.slug)
          )
        } catch (galleryCoverErr) {
          console.error('Index galleryFeedCovers load failed:', galleryCoverErr)
        }
      }

      const finalProps = JSON.parse(JSON.stringify(sharedPageStaticProps.props))
      const finalPosts = JSON.parse(JSON.stringify(filteredPosts))
      const finalWidgets = JSON.parse(JSON.stringify(safeWidgets || {}))
      const finalTweetFeedMedia = tweetFeedMedia
        ? JSON.parse(JSON.stringify(tweetFeedMedia))
        : null

      const finalGalleryFeedCovers = galleryFeedCovers
        ? JSON.parse(JSON.stringify(galleryFeedCovers))
        : null

      return {
        props: {
          ...finalProps,
          posts: finalPosts,
          widgets: finalWidgets,
          tweetFeedMedia: finalTweetFeedMedia,
          galleryFeedCovers: finalGalleryFeedCovers,
          shopBanner: JSON.parse(JSON.stringify(shopBanner || null)),
          seo: buildHomePageSeo(),
        },
        revalidate: CONFIG.NEXT_REVALIDATE_SECONDS,
      }
    } catch (e) {
      console.error('Index page build failed:', e)
      const base = JSON.parse(JSON.stringify(sharedPageStaticProps.props))
      return {
        props: {
          ...base,
          posts: [],
          widgets: {},
          shopBanner: null,
          seo: buildHomePageSeo(),
          // 保留 sharedPageStaticProps 中的 activeTheme，由 withNavFooter 末尾再次校正
        },
        revalidate: CONFIG.NEXT_REVALIDATE_SECONDS,
      }
    }
  }
)

const withNavPage = withNavFooter(Home, undefined, true)
;(withNavPage as NextPageWithLayout).getLayout = (page) =>
  applyThemePageLayout(page, (p) => <BlogLayout>{p}</BlogLayout>)
export default withNavPage
