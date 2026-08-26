import { Empty } from '@/src/components/Empty'
import { LargeTitle } from '@/src/components/LargeTitle'
import { ContainerLayoutFull } from '@/src/components/post/ContainerLayout'
import { PaginationSection } from '@/src/components/section/PaginationSection'
import { Page, Post } from '@/src/types/blog'
import { ShopPostCard } from './ShopPostCard'

type ShopArchiveProps = {
  page: Page
  items: Post[]
  pageCount: number
  currentPage: number
  galleryFeedCovers?: Record<string, string> | null
}

/** shop 主题归档：商品化卡片网格 + 分页；壳层走默认 BlogLayout */
export function ShopArchive({
  page,
  items,
  pageCount,
  currentPage,
  galleryFeedCovers,
}: ShopArchiveProps) {
  const { title } = page

  return (
    <>
      <ContainerLayoutFull>
        <LargeTitle title={title} />
      </ContainerLayoutFull>
      <ContainerLayoutFull>
        {items.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((post) => (
              <ShopPostCard
                key={post.id}
                post={post}
                galleryCoverSrc={galleryFeedCovers?.[post.slug] ?? null}
              />
            ))}
          </div>
        ) : (
          <Empty />
        )}
        {pageCount !== 0 && (
          <PaginationSection
            currentPage={currentPage}
            currentQuery={{}}
            totalPages={pageCount}
            basePath="archive"
          />
        )}
      </ContainerLayoutFull>
    </>
  )
}
