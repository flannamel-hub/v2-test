import CONFIG from '@/blog.config'
import { GetStaticProps, GetStaticPropsContext, NextPage } from 'next'
import { BlockRender } from '../components/blocks/BlockRender'
import { LargeTitle } from '../components/LargeTitle'
import { BlogLayoutPure } from '../components/layout/BlogLayout'
import ContainerLayout from '../components/post/ContainerLayout'
import { WidgetCollection } from '../components/section/WidgetCollection'
import withNavFooter from '../components/withNavFooter'
import { formatBlocks } from '../lib/blog/format/block'
import { loadHomeWidgets } from '../lib/blog/loadHomeWidgets'
import { withNavFooterStaticProps } from '../lib/blog/withNavFooterStaticProps'
import { getAllBlocks } from '../lib/notion/getBlocks'
import { addSubTitle } from '../lib/util'
import { NextPageWithLayout, Page, SharedNavFooterStaticProps } from '../types/blog'
import { BlockResponse } from '../types/notion'
import { GalleryArticlePage } from '@/src/themes/gallery/GalleryArticlePage'
import { TweetArticlePage } from '@/src/themes/tweet/TweetArticlePage'
import { TweetShell } from '@/src/themes/tweet/TweetShell'
import { isTweetTheme } from '@/src/themes/tweet/tweetTheme'
import { pickTweetShellWidgets } from '@/src/themes/tweet/tweetShellWidgets'
import { applyThemePageLayout } from '@/src/themes/themeLayout'
import { isShopTheme } from '@/src/themes/shop/shopTheme'

const { ABOUT } = CONFIG.DEFAULT_SPECIAL_PAGES

const About: NextPage<{
  blocks: BlockResponse[]
  title: string
  page: Page | null
  widgets: {
    [key: string]: unknown
  }
  activeTheme?: string
  siteTitle?: SharedNavFooterStaticProps['props']['siteTitle']
}> = ({ blocks, title, page, widgets, activeTheme, siteTitle, vendingConfig, vendingEnabled }) => {
  if (activeTheme === 'gallery') {
    const heading = page?.nav || title
    return (
      <GalleryArticlePage
        title={heading}
        blocks={blocks}
        breadcrumbLabel={heading}
        excerpt={page?.title && page.title !== page.nav ? page.title : null}
      />
    )
  }

  if (isTweetTheme(activeTheme)) {
    const heading = page?.nav || title
    const shellWidgets = pickTweetShellWidgets(widgets)
    return (
      <TweetShell
        siteTitle={siteTitle}
        profile={shellWidgets.profile}
        vendingConfig={vendingConfig}
        vendingEnabled={vendingEnabled !== false}
      >
        <TweetArticlePage
          title={heading}
          blocks={blocks}
          excerpt={page?.title && page.title !== page.nav ? page.title : null}
        />
      </TweetShell>
    )
  }

  return (
    <>
      <ContainerLayout>
        <LargeTitle className="mb-4" title={title} />
        <div className="break-words rounded-2xl bg-white px-8 py-4 dark:bg-neutral-900">
          <BlockRender blocks={blocks} />
        </div>
        {/* E1:shop 主题 /about 仅正文,不渲染 standard 首页残留组件(profile/公告入口) */}
        {!isShopTheme(activeTheme) && (
          <div className="mt-6" data-aos="fade-up">
            {widgets && <WidgetCollection widgets={widgets} />}
          </div>
        )}
      </ContainerLayout>
    </>
  )
}

export const getStaticProps: GetStaticProps = withNavFooterStaticProps(
  async (
    _context: GetStaticPropsContext,
    sharedPageStaticProps: SharedNavFooterStaticProps
  ) => {
    addSubTitle(sharedPageStaticProps.props, ABOUT)
    const page =
      sharedPageStaticProps.props.navPages.find(
        (p) => p.slug === ABOUT
      ) ?? null

    const blocks = await getAllBlocks(page?.id ?? '')
    const formattedBlocks = await formatBlocks(blocks)

    const formattedWidgets = await loadHomeWidgets()

    const safeBlocks = formattedBlocks || []
    const safeTitle = page?.title ?? page?.nav ?? 'About'

    return {
      props: {
        ...sharedPageStaticProps.props,
        page,
        blocks: safeBlocks,
        title: safeTitle,
        widgets: formattedWidgets || {},
      },
      revalidate: CONFIG.NEXT_REVALIDATE_SECONDS,
    }
  }
)

const withNavPage = withNavFooter(About)

;(withNavPage as NextPageWithLayout).getLayout = (page) =>
  applyThemePageLayout(page, (p) => <BlogLayoutPure>{p}</BlogLayoutPure>)

export default withNavPage
