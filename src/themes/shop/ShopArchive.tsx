import React, { useMemo, useState } from 'react'
import { FiPackage } from 'react-icons/fi'
import { getCategoriesInfo } from '@/src/lib/blog/format/category'
import { getTagsInfo } from '@/src/lib/blog/format/tag'
import { Page, Post } from '@/src/types/blog'
import { ShopCatalogSidebar } from './ShopCatalogSidebar'
import { ShopPagination } from './ShopPagination'
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
 * shop 主题归档 v3(P18-C4-4 批1,按独角数卡 /products 版式完全还原):
 * P18C45FIX 批3(B3-①)顶部改居中式:大标题「商品中心」+ 副标题「浏览我们的精选商品」
 * + 下方分隔线(移除左对齐面包屑);
 * P18C45UI 批3:外层容器收窄为 max-w-6xl + mx-auto,内容区(侧边栏+卡片网格+分页)
 * 改 flex 布局——侧栏固定 248px(ShopCatalogSidebar 根节点自带宽度),
 * 卡片区 flex-1,整体在页面视觉中线居中(禁止左贴边留右侧空白);分页控件同容器内;
 * 右侧文章卡流式网格 `auto-fit minmax(228px,1fr)`(P18C45UI A3:空轨道折叠,
 * 行内不留尾部空档,网格各行列对齐区域中线);
 * 未筛选时保留现有 /archive/[page] 服务端分页(P18C45UI A1:弃用 standard
 * PaginationSection,改 ShopPagination 独角数卡式圆角页签,当前页蓝色高亮);
 * 分类/标签/搜索组合筛选时对全量文章过滤并隐藏分页。
 * P18-C4-4B 起原 ShopCatalogSection 独立组件合并进本文件。
 * P18C45UI A2:移除网格/列表视图切换按钮,仅保留网格视图。
 */
export function ShopArchive({
  items,
  shopAllPosts,
  pageCount,
  currentPage,
  galleryFeedCovers,
}: ShopArchiveProps) {
  const allPosts = shopAllPosts ?? items

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  )
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

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
      {/* P18C45UI 批3:容器由 7xl 收窄为 max-w-6xl 居中;内容区整体居中 */}
      <div className="mx-auto w-full max-w-6xl px-4 pb-6 md:px-6">
        {/* B3-①:居中大标题 + 副标题 + 分隔线(移除左对齐面包屑,按居中式规划) */}
        <div className="pb-2 pt-6 text-center md:pt-8">
          <h1 className="break-words text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white md:text-4xl">
            商品中心
          </h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400 md:text-base">
            浏览我们的精选商品
          </p>
          <div
            aria-hidden="true"
            className="mt-5 h-px w-full bg-neutral-200 dark:bg-white/10"
          />
        </div>

        {/* 布局修正(用户2026-08-28):侧栏贴容器最左;网格+页签整体在页面中线——
            三列 grid [248px_1fr_248px],右侧空列使网格区域中心=页面中心 */}
        <div className="grid grid-cols-1 items-start gap-7 py-1.5 pb-9 lg:grid-cols-[248px_1fr_248px]">
          <ShopCatalogSidebar
            categories={categories}
            tags={tags}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            selectedTagId={selectedTagId}
            onSelectTag={setSelectedTagId}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />

          <section className="min-w-0" aria-label="商品列表">
            {/* A2:视图切换按钮已移除(仅保留网格);工具条仅筛选中显示清除入口 */}
            {hasFilter ? (
              <div className="mb-4 flex min-h-8 items-center gap-3">
                <button type="button" onClick={clearFilters} className={CLEAR_BUTTON}>
                  清除筛选
                </button>
              </div>
            ) : null}

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
            ) : (
              /* A3:auto-fit 空轨道折叠——不足整行的尾行卡片均分整行宽度,
                  不再左侧偏排留右侧空档,网格各行对齐区域中线 */
              <div className="grid grid-cols-[repeat(auto-fit,minmax(228px,1fr))] items-stretch gap-4">
                {visiblePosts.map((post) => (
                  <ShopPostCard
                    key={post.id}
                    post={post}
                    galleryCoverSrc={galleryFeedCovers?.[post.slug] ?? null}
                  />
                ))}
              </div>
            )}

            {!hasFilter && pageCount !== 0 ? (
              <ShopPagination
                ariaLabel="商品分页"
                currentPage={currentPage}
                totalPages={pageCount}
                hrefForPage={(p) => (p <= 1 ? '/archive' : `/archive/${p}`)}
              />
            ) : null}
          </section>
        </div>
      </div>
    </>
  )
}
