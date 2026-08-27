import React, { useMemo, useState } from 'react'
import { FiGrid, FiList, FiPackage } from 'react-icons/fi'
import { getCategoriesInfo } from '@/src/lib/blog/format/category'
import { getTagsInfo } from '@/src/lib/blog/format/tag'
import { classNames } from '@/src/lib/util'
import { Post } from '@/src/types/blog'
import { ShopCatalogSidebar } from './ShopCatalogSidebar'
import { ShopPostCard } from './ShopPostCard'

type ShopCatalogSectionProps = {
  /** 全量文章(客户端分类/标签/搜索过滤的数据源) */
  posts: Post[]
  /** 服务端分页切片(归档页未筛选时渲染;首页不传则直接渲染 posts) */
  pageItems?: Post[] | null
  galleryFeedCovers?: Record<string, string> | null
  /** 归档页标签栏(独有增强);首页 false */
  showTags?: boolean
  /** 未筛选时渲染的归档分页(PaginationSection) */
  pagination?: React.ReactNode
  /** 区块标题(首页「全部文章」;归档页已有 LargeTitle 可不传) */
  title?: string
}

const CLEAR_BUTTON =
  'shrink-0 rounded-full border border-neutral-200 px-2.5 py-1 font-semibold text-neutral-600 transition-colors duration-200 ease-out hover:border-neutral-900 hover:text-neutral-900 dark:border-white/15 dark:text-neutral-300 dark:hover:border-white dark:hover:text-white'

/**
 * P18-C4-2:shop 目录区(首页与归档共用)。
 * 布局参考独角数卡:左分类栏+搜索(+归档标签栏),右商品化卡片网格;
 * 分类/标签/搜索客户端组合过滤;支持网格/列表两种卡片形态;
 * 归档页未筛选时渲染服务端分页(pagination 插槽),筛选中隐藏分页。
 */
export function ShopCatalogSection({
  posts,
  pageItems = null,
  galleryFeedCovers,
  showTags = false,
  pagination = null,
  title,
}: ShopCatalogSectionProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')

  const categories = useMemo(() => getCategoriesInfo(posts), [posts])
  const tags = useMemo(() => (showTags ? getTagsInfo(posts) : []), [posts, showTags])

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const hasFilter = Boolean(selectedCategoryId || selectedTagId || normalizedSearch)

  const filteredPosts = useMemo(() => {
    if (!hasFilter) return posts
    return posts.filter((post) => {
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
  }, [posts, selectedCategoryId, selectedTagId, normalizedSearch, hasFilter])

  // 未筛选:归档用服务端分页切片,首页用全量;筛选中:全量过滤结果
  const visiblePosts = hasFilter ? filteredPosts : pageItems ?? posts

  const clearFilters = () => {
    setSelectedCategoryId(null)
    setSelectedTagId(null)
    setSearchQuery('')
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
      {title ? (
        <h2
          data-aos="fade-up"
          className="mb-6 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white"
        >
          {title}
        </h2>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <ShopCatalogSidebar
          categories={categories}
          tags={tags}
          totalCount={posts.length}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={setSelectedCategoryId}
          selectedTagId={selectedTagId}
          onSelectTag={setSelectedTagId}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
        />

        <section className="min-w-0 flex-1" aria-label="文章列表">
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
                <span className="shrink-0">共 {posts.length} 篇</span>
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
                    className={classNames(
                      'grid h-7 w-7 place-items-center rounded-lg transition-colors duration-200 ease-out',
                      layout === id
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                        : 'text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    )}
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
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

          {!hasFilter ? pagination : null}
        </section>
      </div>
    </div>
  )
}
