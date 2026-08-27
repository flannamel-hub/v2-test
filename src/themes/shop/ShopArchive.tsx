import React, { useMemo, useState } from 'react'
import { FiGrid, FiList, FiPackage } from 'react-icons/fi'
import { LargeTitle } from '@/src/components/LargeTitle'
import { PaginationSection } from '@/src/components/section/PaginationSection'
import { getCategoriesInfo } from '@/src/lib/blog/format/category'
import { getTagsInfo } from '@/src/lib/blog/format/tag'
import { Page, Post } from '@/src/types/blog'
import { ShopCatalogSidebar } from './ShopCatalogSidebar'
import { ShopPostCard } from './ShopPostCard'

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

const CLEAR_BUTTON =
  'shrink-0 rounded-full border border-neutral-200 px-2.5 py-1 font-semibold text-neutral-600 transition-colors duration-200 ease-out hover:border-neutral-900 hover:text-neutral-900 dark:border-white/15 dark:text-neutral-300 dark:hover:border-white dark:hover:text-white'

/**
 * shop 主题归档 v2(P18-C4-4B,按独角数卡 /products 版式完全还原):
 * `grid items-start gap-7 py-1.5 pb-9 lg:grid-cols-[248px_1fr]` 双栏——
 * 左 248px sticky 侧栏(搜索 + 分类计数列表 + 标签栏增强 + 移动端横向 chips);
 * 右侧文章卡流式网格 `auto-fill minmax(228px,1fr)`(替代固定列);
 * 未筛选时保留现有 /archive/[page] 服务端分页(PaginationSection);
 * 分类/标签/搜索组合筛选时对全量文章过滤并隐藏分页。
 * P18-C4-4B 起原 ShopCatalogSection 独立组件合并进本文件。
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

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  )
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')

  const categories = useMemo(() => getCategoriesInfo(allPosts), [allPosts])
  const tags = useMemo(() => getTagsInfo(allPosts), [allPosts])

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const hasFilter = Boolean(selectedCategoryId || selectedTagId || normalizedSearch)

  const filteredPosts = useMemo(() => {
    if (!hasFilter) return allPosts
    return allPosts.filter((post) => {
      if (selectedCategoryId && post.category?.id !== selectedCategoryId) {
        return false
      }
      if (
        selectedTagId &&
        !(post.tags || []).some((tag) => tag.id === selectedTagId)
      ) {
        return false
      }
      if (normalizedSearch) {
        const haystack = `${post.title}\n${post.excerpt}\n${
          post.options?.linkedProductSku ?? ''
        }`.toLowerCase()
        if (!haystack.includes(normalizedSearch)) return false
      }
      return true
    })
  }, [allPosts, selectedCategoryId, selectedTagId, normalizedSearch, hasFilter])

  // 未筛选:服务端分页切片;筛选中:全量过滤结果
  const visiblePosts = hasFilter ? filteredPosts : items

  const clearFilters = () => {
    setSelectedCategoryId(null)
    setSelectedTagId(null)
    setSearchQuery('')
  }

  return (
    <>
      <div className="mx-auto my-6 w-full max-w-7xl px-4 md:px-6">
        <LargeTitle title={title} />
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
        <div className="grid items-start gap-7 py-1.5 pb-9 lg:grid-cols-[248px_1fr]">
          <ShopCatalogSidebar
            categories={categories}
            tags={tags}
            totalCount={allPosts.length}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            selectedTagId={selectedTagId}
            onSelectTag={setSelectedTagId}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />

          <section className="min-w-0" aria-label="文章列表">
            <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                {hasFilter ? (
                  <>
                    <span className="shrink-0">匹配 {filteredPosts.length} 篇</span>
                    <button type="button" onClick={clearFilters} className={CLEAR_BUTTON}>
                      清除筛选
                    </button>
                  </>
                ) : (
                  <span className="shrink-0">共 {allPosts.length} 篇</span>
                )}
              </div>
              {visiblePosts.length > 0 ? (
                <div className="flex shrink-0 items-center gap-1 rounded-xl border border-neutral-200 p-1 dark:border-white/10">
                  {(
                    [
                      { id: 'grid', icon: FiGrid, label: '网格视图' },
                      { id: 'list', icon: FiList, label: '列表视图' },
                    ] as const
                  ).map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      type="button"
                      aria-label={label}
                      onClick={() => setLayout(id)}
                      className={
                        'grid h-7 w-7 place-items-center rounded-lg transition-colors duration-200 ease-out ' +
                        (layout === id
                          ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                          : 'text-neutral-400 hover:text-neutral-900 dark:hover:text-white')
                      }
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {visiblePosts.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 py-16 text-center dark:border-neutral-700">
                <FiPackage
                  className="h-10 w-10 text-neutral-300 dark:text-neutral-600"
                  aria-hidden
                />
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {hasFilter ? '没有匹配的内容' : '暂无内容'}
                </p>
                {hasFilter ? (
                  <button type="button" onClick={clearFilters} className={CLEAR_BUTTON}>
                    清除筛选
                  </button>
                ) : null}
              </div>
            ) : layout === 'grid' ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(228px,1fr))] items-stretch gap-4">
                {visiblePosts.map((post) => (
                  <ShopPostCard
                    key={post.id}
                    post={post}
                    galleryCoverSrc={galleryFeedCovers?.[post.slug] ?? null}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {visiblePosts.map((post) => (
                  <ShopPostCard
                    key={post.id}
                    post={post}
                    variant="list"
                    galleryCoverSrc={galleryFeedCovers?.[post.slug] ?? null}
                  />
                ))}
              </div>
            )}

            {!hasFilter && pageCount !== 0 ? (
              <PaginationSection
                currentPage={currentPage}
                currentQuery={{}}
                totalPages={pageCount}
                basePath="archive"
              />
            ) : null}
          </section>
        </div>
      </div>
    </>
  )
}
