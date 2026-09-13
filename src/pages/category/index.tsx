import CONFIG from '@/blog.config'
import { LargeTitle } from '@/src/components/LargeTitle'
import { BlogLayoutPure } from '@/src/components/layout/BlogLayout'
import ContainerLayout from '@/src/components/post/ContainerLayout'
import { CategoriesCollection } from '@/src/components/section/CategoriesCollection'
import { Section404 } from '@/src/components/section/Section404'
import withNavFooter from '@/src/components/withNavFooter'
import { GalleryCategoryIndex } from '@/src/themes/gallery/GalleryCategoryIndex'
import { getCategoriesInfo } from '@/src/lib/blog/format/category'
import { formatPosts, FORMAT_POST_LIST_OPTIONS } from '@/src/lib/blog/format/post'
import { filterVisiblePosts } from '@/src/lib/blog/hiddenPosts'
import { withNavFooterStaticProps } from '@/src/lib/blog/withNavFooterStaticProps'
import { getPostsAndPieces } from '@/src/lib/notion/getBlogData'
import { addSubTitle } from '@/src/lib/util'
import {
  Category,
  NextPageWithLayout,
  Page,
  SharedNavFooterStaticProps,
} from '@/src/types/blog'
import { ApiScope } from '@/src/types/notion'
import { GetStaticProps, GetStaticPropsContext, NextPage } from 'next'

const { CATEGORY } = CONFIG.DEFAULT_SPECIAL_PAGES

export const getStaticProps: GetStaticProps = withNavFooterStaticProps(
  async (
    _context: GetStaticPropsContext,
    sharedPageStaticProps: SharedNavFooterStaticProps
  ) => {
    const slug = CATEGORY
    addSubTitle(sharedPageStaticProps.props, slug)
    const { posts } = await getPostsAndPieces(ApiScope.Archive)

    const pages = sharedPageStaticProps.props.navPages
    const page = pages.find((page) => page.slug === slug) ?? null

    const formattedPosts = await formatPosts(posts, FORMAT_POST_LIST_OPTIONS)

    const categories = getCategoriesInfo(filterVisiblePosts(formattedPosts))

    return {
      props: {
        ...sharedPageStaticProps.props,
        page,
        categories,
      },
      revalidate: CONFIG.NEXT_REVALIDATE_SECONDS,
    }
  }
)

const Categories: NextPage<{
  page: Page
  categories: Category[]
  activeTheme?: string
}> = ({ page, categories, activeTheme }) => {
  if (!page) return <Section404 />

  if (activeTheme === 'gallery') {
    return <GalleryCategoryIndex page={page} categories={categories} />
  }

  const { title } = page

  return (
    <ContainerLayout>
      <LargeTitle title={title} />
      <CategoriesCollection categories={categories} />
    </ContainerLayout>
  )
}

const withNavPage = withNavFooter(Categories)

;(withNavPage as NextPageWithLayout).getLayout = (page) => {
  if ((page.props as { activeTheme?: string })?.activeTheme === 'gallery') {
    return page
  }
  return <BlogLayoutPure>{page}</BlogLayoutPure>
}

export default withNavPage
