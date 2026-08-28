import CONFIG from '@/blog.config'
import { buildArchivePageProps } from '@/src/lib/blog/buildArchiveFeed'
import { ArchiveFilter } from '@/src/components/ArchiveFilter'
import { Empty } from '@/src/components/Empty'
import { LargeTitle } from '@/src/components/LargeTitle'
import { BlogLayoutPure } from '@/src/components/layout/BlogLayout'
import { ContainerLayoutFull } from '@/src/components/post/ContainerLayout'
import { ArchiveCollection } from '@/src/components/section/ArchiveCollection'
import { PaginationSection } from '@/src/components/section/PaginationSection'
import { Section404 } from '@/src/components/section/Section404'
import withNavFooter from '@/src/components/withNavFooter'
import { initialCategory } from '@/src/lib/blog/format/category'
import { initialTag } from '@/src/lib/blog/format/tag'
import { onDemandStaticPaths } from '@/src/lib/blog/postLimits'
import { withNavFooterStaticProps } from '@/src/lib/blog/withNavFooterStaticProps'
import { addSubTitle } from '@/src/lib/util'
import { GalleryArchive } from '@/src/themes/gallery/GalleryArchive'
import { ShopArchive } from '@/src/themes/shop/ShopArchive'
import { isShopTheme } from '@/src/themes/shop/shopTheme'
import {
  Category,
  NextPageWithLayout,
  Page,
  Post,
  SharedNavFooterStaticProps,
  Tag,
} from '@/src/types/blog'
import { GetStaticProps, GetStaticPropsContext, NextPage } from 'next'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

const { ARCHIVE } = CONFIG.DEFAULT_SPECIAL_PAGES

export const getStaticPaths = async () => onDemandStaticPaths

export const getStaticProps: GetStaticProps = withNavFooterStaticProps(
  async (
    context: GetStaticPropsContext,
    sharedPageStaticProps: SharedNavFooterStaticProps
  ) => {
    const slug = ARCHIVE
    const currentPage = Number(context.params?.page as string)

    if (!currentPage || Number.isNaN(currentPage) || currentPage < 1) {
      return { notFound: true }
    }

    if (currentPage === 1) {
      return {
        redirect: {
          destination: `/${ARCHIVE}`,
          permanent: true,
        },
      }
    }

    addSubTitle(sharedPageStaticProps.props, slug)
    const pages = sharedPageStaticProps.props.navPages
    const page = pages.find((page) => page.slug === slug) ?? null
    const archiveData = await buildArchivePageProps(
      currentPage,
      sharedPageStaticProps.props.activeTheme
    )

    if (currentPage > archiveData.pageCount) {
      return { notFound: true }
    }

    return {
      props: {
        ...sharedPageStaticProps.props,
        page,
        ...archiveData,
        currentPage,
      },
      revalidate: CONFIG.NEXT_REVALIDATE_SECONDS,
    }
  }
)

const Archive: NextPage<{
  page: Page
  items: Post[]
  tags: Tag[]
  categories: Category[]
  pageCount: number
  tagCategoryMapById: Record<string, string[]>
  categoryTagMapById: Record<string, string[]>
  currentPage: number
  totalCount?: number
  activeTheme?: string
  galleryFeedCovers?: Record<string, string> | null
  shopAllPosts?: Post[] | null
}> = ({
  page,
  items,
  tags,
  categories,
  pageCount,
  tagCategoryMapById,
  categoryTagMapById,
  currentPage,
  totalCount,
  activeTheme,
  galleryFeedCovers,
  shopAllPosts,
}) => {
  const [pageCountAfterFilter, setPageCountAfterFilter] = useState(pageCount)
  const [itemsAfterFilter, setItemsAfterFilter] = useState(items)
  const [currentQuery, setCurrentQuery] = useState({})
  const [filterLoading, setFilterLoading] = useState(false)

  const router = useRouter()

  useEffect(() => {
    if (router.query && currentQuery !== router.query) {
      setCurrentQuery(router.query)
    }
  }, [currentQuery, router.query])

  useEffect(() => {
    setItemsAfterFilter(items)
    setPageCountAfterFilter(pageCount)
  }, [items, pageCount])

  useEffect(() => {
    const tag = (router.query.tag as string) || initialTag.id
    const category = (router.query.category as string) || initialCategory.id
    const hasFilter =
      tag !== initialTag.id || category !== initialCategory.id

    if (!hasFilter) {
      setItemsAfterFilter(items)
      setPageCountAfterFilter(pageCount)
      return
    }

    let cancelled = false
    setFilterLoading(true)
    fetch(
      `/api/archive/feed?page=${currentPage}&tag=${encodeURIComponent(tag)}&category=${encodeURIComponent(category)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.success) return
        setItemsAfterFilter(data.items)
        setPageCountAfterFilter(data.pageCount)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFilterLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [items, pageCount, router.query, currentPage])

  useEffect(() => {
    if (router.query.tag === initialTag.id) {
      categories.map((category) => {
        category.disabled = false
      })
    }
    if (router.query.tag && router.query.tag !== initialTag.id) {
      categories.map((category) => {
        categoryTagMapById[category.id].includes(router.query.tag as string)
          ? (category.disabled = false)
          : (category.disabled = true)
      })
    }
  }, [categories, categoryTagMapById, router.query.tag])

  useEffect(() => {
    if (router.query.category === initialCategory.id) {
      tags.map((tag) => {
        tag.disabled = false
      })
    }
    if (router.query.category && router.query.category !== initialCategory.id) {
      tags.map((tag) => {
        tagCategoryMapById[tag.id].includes(router.query.category as string)
          ? (tag.disabled = false)
          : (tag.disabled = true)
      })
    }
  }, [router.query.category, tagCategoryMapById, tags])

  if (!page || !currentPage) return <Section404 />

  if (activeTheme === 'gallery') {
    return (
      <GalleryArchive
        page={page}
        items={itemsAfterFilter}
        pageCount={pageCountAfterFilter}
        currentPage={currentPage}
        totalCount={totalCount}
      />
    )
  }

  // P18-C4-7:shop 系(shop / shop-v2)归档一律复用 ShopArchive
  if (isShopTheme(activeTheme)) {
    return (
      <ShopArchive
        page={page}
        items={items}
        shopAllPosts={shopAllPosts ?? null}
        pageCount={pageCount}
        currentPage={currentPage}
        galleryFeedCovers={galleryFeedCovers}
      />
    )
  }

  const { title } = page

  return (
    <>
      <ContainerLayoutFull>
        <LargeTitle title={title} />
      </ContainerLayoutFull>
      <ArchiveFilter
        items={{
          tags,
          categories,
        }}
      />
      <ContainerLayoutFull>
        {filterLoading ? (
          <p className="my-8 text-center text-neutral-500">加载中…</p>
        ) : itemsAfterFilter.length > 0 ? (
          <ArchiveCollection
            items={itemsAfterFilter}
            galleryFeedCovers={galleryFeedCovers}
          />
        ) : (
          <Empty />
        )}
        {pageCountAfterFilter !== 0 && (
          <PaginationSection
            currentPage={currentPage}
            currentQuery={currentQuery}
            totalPages={pageCountAfterFilter}
            basePath={ARCHIVE}
          />
        )}
      </ContainerLayoutFull>
    </>
  )
}

const withNavPage = withNavFooter(Archive)

;(withNavPage as NextPageWithLayout).getLayout = (page) => {
  if ((page.props as { activeTheme?: string })?.activeTheme === 'gallery') {
    return page
  }
  return <BlogLayoutPure>{page}</BlogLayoutPure>
}

export default withNavPage
