import { LargeTitle } from '@/src/components/LargeTitle'
import { PaginationSection } from '@/src/components/section/PaginationSection'
import { Page, Post } from '@/src/types/blog'
import { ShopCatalogSection } from './ShopCatalogSection'

type ShopArchiveProps = {
  page: Page
  /** 服务端当前页切片(未筛选时渲染 + 分页依据) */
  items: Post[]
  /** shop 主题全量文章(buildArchivePageProps 仅为 shop 主题下发,客户端筛选数据源) */
  shopAllPosts?: Post[] | null
  pageCount: number
  currentPage: number
  galleryFeedCovers?: Record<string, string> | null
}

/**
 * shop 主题归档 v1(P18-C4-2.2 重做,独角数卡 products 版面+增强):
 * 左分类栏+搜索+标签栏(分类栏下方,独有增强),右商品化卡片网格;
 * 未筛选时保留现有 /archive/[page] 服务端分页(PaginationSection);
 * 分类/标签/搜索组合筛选时对全量文章过滤并隐藏分页。
 */
export function ShopArchive({
  page,
  items,
  shopAllPosts,
  pageCount,
  currentPage,
  galleryFeedCovers,
}: ShopArchiveProps) {
  const { title } = page
  const allPosts = shopAllPosts ?? items

  return (
    <>
      <div className="mx-auto my-6 w-full max-w-7xl px-4 md:px-6">
        <LargeTitle title={title} />
      </div>
      <div className="pb-10">
        <ShopCatalogSection
          posts={allPosts}
          pageItems={items}
          showTags
          galleryFeedCovers={galleryFeedCovers}
          pagination={
            pageCount !== 0 ? (
              <PaginationSection
                currentPage={currentPage}
                currentQuery={{}}
                totalPages={pageCount}
                basePath="archive"
              />
            ) : null
          }
        />
      </div>
    </>
  )
}
