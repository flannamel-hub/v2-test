import CONFIG from '@/blog.config'
import BlogLayout, {
  BlogLayoutWithColor,
} from '@/src/components/layout/BlogLayout'
import { Section404 } from '@/src/components/section/Section404'
import { SubCollection } from '@/src/components/section/SubCollection'
import withNavFooter from '@/src/components/withNavFooter'
import { GalleryFilteredPosts } from '@/src/themes/gallery/GalleryFilteredPosts'
import { TweetFilteredPosts } from '@/src/themes/tweet/TweetFilteredPosts'
import { TweetShell } from '@/src/themes/tweet/TweetShell'
import { buildTweetProfileData } from '@/src/themes/tweet/tweetProfile'
import { isTweetTheme } from '@/src/themes/tweet/tweetTheme'
import { pickTweetShellWidgets } from '@/src/themes/tweet/tweetShellWidgets'
import { usesStandaloneThemeLayout } from '@/src/themes/themeLayout'
import { loadHomeWidgets } from '@/src/lib/blog/loadHomeWidgets'
import { loadGalleryFeedCovers } from '@/src/lib/gallery/galleryFeedPreviews'
import { shouldLoadGalleryFeedCovers } from '@/src/lib/gallery/shouldLoadGalleryFeedCovers'
import { loadTweetFeedMedia } from '@/src/lib/tweet/loadTweetFeedMedia'
import { getAllCategories } from '@/src/lib/blog/format/category'
import { formatPosts, FORMAT_POST_LIST_OPTIONS } from '@/src/lib/blog/format/post'
import { filterVisiblePosts } from '@/src/lib/blog/hiddenPosts'
import { withNavFooterStaticProps } from '@/src/lib/blog/withNavFooterStaticProps'
import { onDemandStaticPaths } from '@/src/lib/blog/postLimits'
import { addSubTitle, getSubTitleInfo } from '@/src/lib/util'
import {
  getLatestPostByDate,
  resolveGalleryPostBannerSrc,
} from '@/src/lib/gallery/postCover'
import { getAllBlocks } from '@/src/lib/notion/getBlocks'
import {
  Category,
  NextPageWithLayout,
  Post,
  SharedNavFooterStaticProps,
  Title,
} from '@/src/types/blog'
import { ApiScope } from '@/src/types/notion'
import { GetStaticProps, GetStaticPropsContext, NextPage } from 'next'
import { getPosts } from '../../lib/notion/getBlogData'

const { CATEGORY } = CONFIG.DEFAULT_SPECIAL_PAGES

export const getStaticPaths = async () => onDemandStaticPaths

export const getStaticProps: GetStaticProps = withNavFooterStaticProps(
  async (
    context: GetStaticPropsContext,
    sharedPageStaticProps: SharedNavFooterStaticProps
  ) => {
    const slug = CATEGORY
    const subTitle = getSubTitleInfo(slug, sharedPageStaticProps.props)
    addSubTitle(sharedPageStaticProps.props, '', subTitle)
    const posts = await getPosts(ApiScope.Archive)
    const formattedPosts = filterVisiblePosts(
      await formatPosts(posts, FORMAT_POST_LIST_OPTIONS)
    )
    const categoryId = context.params?.category as string
    const postsByCategory = formattedPosts.filter(
      (post) => post.category.id === categoryId
    )
    const category =
      postsByCategory[0]?.category ??
      getAllCategories(formattedPosts).find((c) => c.id === categoryId) ?? {
        id: categoryId,
        name: categoryId,
        color: 'gray' as const,
      }

    let categoryBannerImage: string | null = null
    let galleryFeedCovers: Record<string, string> | null = null
    const activeTheme = sharedPageStaticProps.props.activeTheme
    if (shouldLoadGalleryFeedCovers(activeTheme) && postsByCategory.length > 0) {
      galleryFeedCovers = await loadGalleryFeedCovers(
        postsByCategory.map((p) => p.slug)
      )
    }
    if (activeTheme === 'gallery' && postsByCategory.length > 0 && galleryFeedCovers) {
      const latestPost = getLatestPostByDate(postsByCategory)
      if (latestPost) {
        const galleryThumb = galleryFeedCovers[latestPost.slug]
        let banner = resolveGalleryPostBannerSrc(
          latestPost,
          undefined,
          galleryThumb
        )
        if (!banner && latestPost.id) {
          try {
            const blocks = await getAllBlocks(latestPost.id)
            banner = resolveGalleryPostBannerSrc(
              latestPost,
              blocks,
              galleryThumb
            )
          } catch (err) {
            console.warn(
              '[category] banner blocks load failed:',
              latestPost.slug,
              err
            )
          }
        }
        categoryBannerImage = banner || null
      }
    }

    const tweetFeedMedia =
      isTweetTheme(sharedPageStaticProps.props.activeTheme)
        ? await loadTweetFeedMedia(postsByCategory)
        : null

    return {
      props: {
        ...sharedPageStaticProps.props,
        posts: postsByCategory,
        category,
        categoryBannerImage,
        subTitle,
        widgets: await loadHomeWidgets(),
        tweetFeedMedia: tweetFeedMedia
          ? JSON.parse(JSON.stringify(tweetFeedMedia))
          : null,
        galleryFeedCovers: galleryFeedCovers
          ? JSON.parse(JSON.stringify(galleryFeedCovers))
          : null,
      },
      revalidate: CONFIG.NEXT_REVALIDATE_SECONDS,
    }
  }
)

const CategoryPage: NextPage<{
  category: Category
  posts: Post[]
  subTitle: Title
  activeTheme?: string
  categoryBannerImage?: string | null
  siteTitle?: SharedNavFooterStaticProps['props']['siteTitle']
  widgets?: Record<string, unknown>
  tweetFeedMedia?: import('@/src/lib/tweet/loadTweetFeedMedia').TweetFeedMediaMap | null
  galleryFeedCovers?: Record<string, string> | null
}> = ({ category, posts, subTitle, activeTheme, categoryBannerImage, siteTitle, widgets, tweetFeedMedia, galleryFeedCovers, vendingConfig, vendingEnabled }) => {
  if (!category) return <Section404 />

  category.count = posts.length

  if (activeTheme === 'gallery') {
    const parentLabel = subTitle?.text || 'Lists'
    const parentHref = subTitle?.slug ? `/${subTitle.slug}` : `/${CATEGORY}`
    return (
      <GalleryFilteredPosts
        posts={posts}
        title={category.name}
        bannerImageUrl={categoryBannerImage}
        galleryFeedCovers={galleryFeedCovers}
        breadcrumbItems={[
          { label: '首页', href: '/' },
          { label: parentLabel, href: parentHref },
          { label: category.name },
        ]}
        emptyLabel="该分类下暂无文章"
      />
    )
  }

  if (isTweetTheme(activeTheme)) {
    const shellWidgets = pickTweetShellWidgets(widgets)
    const profileData = buildTweetProfileData(shellWidgets.profile, siteTitle)
    return (
      <TweetShell
        siteTitle={siteTitle}
        profile={shellWidgets.profile}
        vendingConfig={vendingConfig}
        vendingEnabled={vendingEnabled !== false}
      >
        <TweetFilteredPosts
          posts={posts}
          title={category.name}
          emptyLabel="该分类下暂无文章"
          profile={profileData}
          feedMedia={tweetFeedMedia}
        />
      </TweetShell>
    )
  }

  return (
    <SubCollection
      item={category}
      posts={posts}
      subTitle={subTitle}
      type={'category'}
      galleryFeedCovers={galleryFeedCovers}
    />
  )
}

const withNavPage = withNavFooter(CategoryPage, true)

;(withNavPage as NextPageWithLayout).getLayout = (page) => {
  if (usesStandaloneThemeLayout((page.props as { activeTheme?: string })?.activeTheme)) {
    return page
  }
  if (!page.props.category) return <BlogLayout>{page}</BlogLayout>
  const color = page.props.category.color
  return color !== 'gray' && color !== 'default' ? (
    <BlogLayoutWithColor color={color}>{page}</BlogLayoutWithColor>
  ) : (
    <BlogLayout>{page}</BlogLayout>
  )
}

export default withNavPage
