import { FiSearch, FiX } from 'react-icons/fi'
import { classNames } from '@/src/lib/util'
import { Category, Tag } from '@/src/types/blog'

type ShopCatalogSidebarProps = {
  categories: Category[]
  /** 归档页标签栏(shop 独有增强);首页不传则不渲染 */
  tags?: Tag[]
  totalCount: number
  selectedCategoryId: string | null
  onSelectCategory: (id: string | null) => void
  selectedTagId?: string | null
  onSelectTag?: (id: string | null) => void
  searchQuery: string
  onSearchQueryChange: (q: string) => void
}

const CHIP_BASE =
  'flex shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ease-out'
const CHIP_ACTIVE =
  'border-transparent bg-neutral-900 text-white dark:bg-white dark:text-black'
const CHIP_IDLE =
  'border-neutral-200 text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 dark:border-white/15 dark:text-neutral-300 dark:hover:border-white dark:hover:text-white'

const SIDEBAR_ITEM_BASE =
  'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors duration-200 ease-out'
const SIDEBAR_ITEM_ACTIVE =
  'bg-neutral-900 font-semibold text-white dark:bg-white dark:text-black'
const SIDEBAR_ITEM_IDLE =
  'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white'

function SearchInput({
  searchQuery,
  onSearchQueryChange,
}: Pick<ShopCatalogSidebarProps, 'searchQuery' | 'onSearchQueryChange'>) {
  return (
    <div className="relative" role="search">
      <FiSearch
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
        aria-hidden
      />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        placeholder="搜索文章 / 商品码"
        aria-label="搜索文章"
        className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-10 pr-9 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-[#1c1c1e] dark:text-white dark:focus:border-white/30"
      />
      {searchQuery ? (
        <button
          type="button"
          aria-label="清空搜索"
          onClick={() => onSearchQueryChange('')}
          className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <FiX className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/**
 * P18-C4-2:shop 目录筛选侧栏(参考独角数卡 CategorySidebar;C4-4B 对齐 248px 版式)。
 * 桌面(lg+):搜索框 + 「全部分类」列表卡片(+ 归档页标签栏,分类栏下方),整列 sticky;
 * 移动端:搜索框 + 分类/标签横向 chips 行。
 * 宽度由父级网格轨道 lg:grid-cols-[248px_1fr] 决定。
 * 过滤状态由父组件(ShopArchive)持有。
 */
export function ShopCatalogSidebar({
  categories,
  tags,
  totalCount,
  selectedCategoryId,
  onSelectCategory,
  selectedTagId,
  onSelectTag,
  searchQuery,
  onSearchQueryChange,
}: ShopCatalogSidebarProps) {
  const tagList = tags ?? []
  const hasTags = tagList.length > 0 && onSelectTag

  return (
    <div className="grid min-w-0 gap-3 lg:sticky lg:top-20 lg:gap-5">
      <SearchInput searchQuery={searchQuery} onSearchQueryChange={onSearchQueryChange} />

      {/* 桌面侧栏:分类列表 + 标签栏 */}
      <aside className="hidden lg:block">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-card dark:border-white/10 dark:bg-[#1c1c1e] dark:shadow-2xl">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
            <span className="h-4 w-1 rounded-full bg-neutral-900 dark:bg-white" aria-hidden />
            分类
          </h2>
          <ul className="space-y-1">
            <li>
              <button
                type="button"
                onClick={() => onSelectCategory(null)}
                className={classNames(
                  SIDEBAR_ITEM_BASE,
                  selectedCategoryId === null ? SIDEBAR_ITEM_ACTIVE : SIDEBAR_ITEM_IDLE
                )}
              >
                <span>全部</span>
                <span className="text-xs font-normal opacity-70">{totalCount}</span>
              </button>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() =>
                    onSelectCategory(
                      selectedCategoryId === category.id ? null : category.id
                    )
                  }
                  className={classNames(
                    SIDEBAR_ITEM_BASE,
                    selectedCategoryId === category.id
                      ? SIDEBAR_ITEM_ACTIVE
                      : SIDEBAR_ITEM_IDLE
                  )}
                >
                  <span className="truncate">{category.name}</span>
                  {typeof category.count === 'number' ? (
                    <span className="text-xs font-normal opacity-70">{category.count}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>

          {hasTags ? (
            <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-white/10">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
                <span
                  className="h-4 w-1 rounded-full bg-neutral-900 dark:bg-white"
                  aria-hidden
                />
                标签
              </h2>
              <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                {tagList.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      onSelectTag!(selectedTagId === tag.id ? null : tag.id)
                    }
                    className={classNames(
                      CHIP_BASE,
                      '!px-2.5 !py-1',
                      selectedTagId === tag.id ? CHIP_ACTIVE : CHIP_IDLE
                    )}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      {/* 移动端:分类 chips */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => onSelectCategory(null)}
          className={classNames(
            CHIP_BASE,
            selectedCategoryId === null ? CHIP_ACTIVE : CHIP_IDLE
          )}
        >
          全部
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() =>
              onSelectCategory(
                selectedCategoryId === category.id ? null : category.id
              )
            }
            className={classNames(
              CHIP_BASE,
              selectedCategoryId === category.id ? CHIP_ACTIVE : CHIP_IDLE
            )}
          >
            {category.name}
          </button>
        ))}
      </div>

      {/* 移动端:标签 chips */}
      {hasTags ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden [&::-webkit-scrollbar]:hidden">
          {tagList.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => onSelectTag!(selectedTagId === tag.id ? null : tag.id)}
              className={classNames(
                CHIP_BASE,
                selectedTagId === tag.id ? CHIP_ACTIVE : CHIP_IDLE
              )}
            >
              #{tag.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
