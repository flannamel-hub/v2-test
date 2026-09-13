import CONFIG from '@/blog.config'
import { LargeTitle } from '@/src/components/LargeTitle'
import { BlogLayoutPure } from '@/src/components/layout/BlogLayout'
import ContainerLayout from '@/src/components/post/ContainerLayout'
import { Section404 } from '@/src/components/section/Section404'
import { TagsCollection } from '@/src/components/section/TagsCollection'
import withNavFooter from '@/src/components/withNavFooter'
import { GalleryTagIndex } from '@/src/themes/gallery/GalleryTagIndex'
import { formatPosts, FORMAT_POST_LIST_OPTIONS } from '@/src/lib/blog/format/post'
import { filterVisiblePosts } from '@/src/lib/blog/hiddenPosts'
import { getTagsInfo } from '@/src/lib/blog/format/tag'
import { withNavFooterStaticProps } from '@/src/lib/blog/withNavFooterStaticProps'
import { getPostsAndPieces } from '@/src/lib/notion/getBlogData'
import { addSubTitle } from '@/src/lib/util'
import {
  NextPageWithLayout,
  Page,
  SharedNavFooterStaticProps,
  Tag,
} from '@/src/types/blog'
import { ApiScope } from '@/src/types/notion'
import { GetStaticProps, GetStaticPropsContext, NextPage } from 'next'

const { TAG } = CONFIG.DEFAULT_SPECIAL_PAGES

export const getStaticProps: GetStaticProps = withNavFooterStaticProps(
  async (
    _context: GetStaticPropsContext,
    sharedPageStaticProps: SharedNavFooterStaticProps
  ) => {
    const slug = TAG
    addSubTitle(sharedPageStaticProps.props, slug)
    const { posts } = await getPostsAndPieces(ApiScope.Archive)
    const pages = sharedPageStaticProps.props.navPages
    const page = pages.find((page) => page.slug === slug) ?? null
    const formattedPosts = await formatPosts(posts, FORMAT_POST_LIST_OPTIONS)
    const tags = getTagsInfo(filterVisiblePosts(formattedPosts))

    return {
      props: {
        ...sharedPageStaticProps.props,
        page,
        tags,
      },
      revalidate: CONFIG.NEXT_REVALIDATE_SECONDS,
    }
  }
)

const Tags: NextPage<{
  page: Page
  tags: Tag[]
  activeTheme?: string
}> = ({ page, tags, activeTheme }) => {
  if (!page) return <Section404 />

  if (activeTheme === 'gallery') {
    return <GalleryTagIndex page={page} tags={tags} />
  }

  const { title } = page
  return (
    <ContainerLayout>
      <LargeTitle title={title} />
      <TagsCollection tags={tags} />
    </ContainerLayout>
  )
}

const withNavPage = withNavFooter(Tags)

;(withNavPage as NextPageWithLayout).getLayout = (page) => {
  if ((page.props as { activeTheme?: string })?.activeTheme === 'gallery') {
    return page
  }
  return <BlogLayoutPure>{page}</BlogLayoutPure>
}

export default withNavPage
