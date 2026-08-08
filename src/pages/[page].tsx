import CONFIG from '@/blog.config'
import { GetStaticProps, GetStaticPropsContext, NextPage } from 'next'
import { BlockRender } from '../components/blocks/BlockRender'
import { Empty } from '../components/Empty'
import { LargeTitle } from '../components/LargeTitle'
import { BlogLayoutPure } from '../components/layout/BlogLayout'
import ContainerLayout from '../components/post/ContainerLayout'
import { Section404 } from '../components/section/Section404'
import withNavFooter from '../components/withNavFooter'
import { formatBlocks } from '../lib/blog/format/block'
import { formatPages } from '../lib/blog/format/page'
import { withNavFooterStaticProps } from '../lib/blog/withNavFooterStaticProps'
import { getAllBlocks } from '../lib/notion/getBlocks'
import { getPages } from '../lib/notion/getBlogData'
import { isTransientNotionError } from '../lib/notion/transientErrors'
import { addSubTitle } from '../lib/util'
import { buildNavPageSeo } from '@/src/lib/seo/lightSeo'
import { TweetArticlePage } from '@/src/themes/tweet/TweetArticlePage'
import { TweetShell } from '@/src/themes/tweet/TweetShell'
import { isTweetTheme } from '@/src/themes/tweet/tweetTheme'
import { pickTweetShellWidgets } from '@/src/themes/tweet/tweetShellWidgets'
import { applyThemePageLayout } from '@/src/themes/themeLayout'
import { loadHomeWidgets } from '../lib/blog/loadHomeWidgets'
import {
  NextPageWithLayout,
  Page,
  SharedNavFooterStaticProps,
} from '../types/blog'
import { BlockResponse } from '../types/notion'
import { onDemandStaticPaths } from '../lib/blog/postLimits'

const systemPageSlugs = new Set([
  ...Object.values(CONFIG.DEFAULT_SPECIAL_PAGES),
  'theme-config',
  'gallery-ad',
  'vending',
  'announcement-popup',
  'popup-ad',
  'click-ad',
  'social-links',
])

export const getStaticPaths = async () => {
  try {
    const pages = await getPages()
    const formattedPages = formatPages(pages)

    const paths = formattedPages
      .slice(0, 20)
      .map((page) => ({
        params: { page: page.slug },
      }))
      .filter((page) => !systemPageSlugs.has(page.params?.page as string))

    return {
      paths,
      fallback: 'blocking' as const,
    }
  } catch (error) {
    if (isTransientNotionError(error)) {
      console.warn('[page] getStaticPaths Notion limit, using on-demand paths')
      return onDemandStaticPaths
    }
    throw error
  }
}

export const getStaticProps: GetStaticProps = withNavFooterStaticProps(
  async (
    context: GetStaticPropsContext,
    sharedPageStaticProps: SharedNavFooterStaticProps
  ) => {
    const slug = context.params?.page as string
    if (systemPageSlugs.has(slug)) {
      return {
        props: JSON.parse(
          JSON.stringify({
            ...sharedPageStaticProps.props,
            page: null,
            blocks: [],
          })
        ),
        revalidate: CONFIG.NEXT_REVALIDATE_SECONDS,
      }
    }

    addSubTitle(sharedPageStaticProps.props, slug)
    const page =
      sharedPageStaticProps.props.navPages.find((page) => page.slug === slug) ??
      null

    if (!page) {
      return {
        props: JSON.parse(
          JSON.stringify({
            ...sharedPageStaticProps.props,
            page: null,
            blocks: [],
          })
        ),
        revalidate: CONFIG.NEXT_REVALIDATE_SECONDS,
      }
    }

    try {
      const blocks = await getAllBlocks(page?.id ?? '')
      const formattedBlocks = await formatBlocks(blocks)
      const widgets = await loadHomeWidgets()

      return {
        props: JSON.parse(
          JSON.stringify({
            ...sharedPageStaticProps.props,
            page: page,
            blocks: formattedBlocks,
            widgets,
            seo: buildNavPageSeo(page),
          })
        ),
        revalidate: CONFIG.NEXT_REVALIDATE_SECONDS,
      }
    } catch (error) {
      console.error(`[page/${slug}] render error:`, error)
      if (isTransientNotionError(error)) throw error
      // 正文块格式化失败时降级为空内容，避免整页 500（自定义页如 announcement 仍可打开）
      return {
        props: JSON.parse(
          JSON.stringify({
            ...sharedPageStaticProps.props,
            page: page,
            blocks: [],
            seo: buildNavPageSeo(page),
          })
        ),
        revalidate: CONFIG.NEXT_REVALIDATE_SECONDS,
      }
    }
  }
)

const Page: NextPage<{
  page: Page
  blocks: BlockResponse[]
  activeTheme?: string
  siteTitle?: SharedNavFooterStaticProps['props']['siteTitle']
  widgets?: Record<string, unknown>
}> = ({ page, blocks, activeTheme, siteTitle, widgets, vendingConfig, vendingEnabled }) => {
  if (!page) return <Section404 />

  const { title } = page

  if (isTweetTheme(activeTheme)) {
    const shellWidgets = pickTweetShellWidgets(widgets)
    return (
      <TweetShell
        siteTitle={siteTitle}
        profile={shellWidgets.profile}
        vendingConfig={vendingConfig}
        vendingEnabled={vendingEnabled !== false}
      >
        <TweetArticlePage title={page.nav || title} blocks={blocks} />
      </TweetShell>
    )
  }

  return (
    <>
      <ContainerLayout>
        <LargeTitle className="mb-4" title={title} />
        {blocks.length > 0 ? (
          <div className="px-8 py-4 break-words bg-white rounded-2xl dark:bg-neutral-900">
            <BlockRender blocks={blocks} />
          </div>
        ) : (
          <Empty />
        )}
      </ContainerLayout>
    </>
  )
}

;(Page as NextPageWithLayout).getLayout = (page) =>
  applyThemePageLayout(page, (p) => <BlogLayoutPure>{p}</BlogLayoutPure>)

export default withNavFooter(Page)
