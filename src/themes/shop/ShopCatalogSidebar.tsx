import { FiSearch, FiX } from 'react-icons/fi'
import { classNames } from '@/src/lib/util'
import { Category, Tag } from '@/src/types/blog'

type ShopCatalogSidebarProps = {
  categories: Category[]
  /** 归档页标签栏(shop 独有增强);首页不传则不渲染 */
  tags?: Tag[]
  selectedCategoryId: string | null
  onSelectCategory: (id: string | null) => void
  selectedTagId?: string | null
  onSelectTag?: (id: string | null) => void
  searchQuery: string
  onSearchQueryChange: (q: string) => void
}

const CHIP_BASE =
  'flex shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ease-out'
/** B3-②:选中态统一独角数卡蓝(实心高亮,hover 变浅) */
const CHIP_ACTIVE =
  'border-transparent bg-blue-500 text-white hover:bg-blue-400'
const CHIP_IDLE =
  'border-neutral-200 text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 dark:border-white/15 dark:text-neutral-300 dark:hover:border-white dark:hover:text-white'

/** B3-②:独角数卡 CategorySidebar 桌面版按钮(圆角矩形 + 选中蓝色实心) */
const SIDEBAR_ITEM_BASE =
  'flex w-full items-center gap-2 rounded-xl border px-4 py-2.5 text-left text-sm transition-all duration-200 ease-out'
const SIDEBAR_ITEM_ACTIVE =
  'border-transparent bg-blue-500 font-semibold text-white hover:bg-blue-400'
const SIDEBAR_ITEM_IDLE =
  'border-transparent text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white'

/** B3-②:卡内小节标题(搜索/分类/标签,独角数卡蓝色竖条 + 加粗) */
const SIDEBAR_HEADING =
  'flex items-center gap-2 text-base font-bold text-neutral-900 dark:text-white'
const SIDEBAR_HEADING_BAR = 'h-5 w-1 rounded-full bg-blue-500'

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
        placeholder="搜索商品名称"
        aria-label="搜索商品"
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
 * P18-C4-4 批1(A2):搜索文案改「搜索商品名称」,分类列表仅名称不带计数。
 * P18C45FIX 批3(B3-②):改独角数卡卡片式——桌面侧栏整体一张圆角卡片
 * (白/暗背景 + 边框 + 阴影),卡内顶部「搜索」小标题 + 输入框,下方「分类」小标题
 * + 圆角矩形分类按钮列表(「全部商品」固定第一项,选中=蓝色实心高亮,hover 变浅),
 * 标签栏保留(同卡片内,选中态同蓝);移动端:搜索框 + 分类/标签横向 chips。
 * P18C45UI 批3:根节点自带宽度(w-full lg:w-[248px] lg:shrink-0),
 * 父级由网格轨道改为 flex 布局(侧栏固定宽 + 内容区 flex-1,整体居中)。
 * 过滤状态由父组件(ShopArchive)持有。
 */
export function ShopCatalogSidebar({
  categories,
  tags,
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
    <div className="grid w-full min-w-0 gap-3 lg:sticky lg:top-20 lg:w-[248px] lg:shrink-0 lg:gap-5">
      {/* 移动端:搜索框(桌面版搜索在下方卡片内) */}
      <div className="lg:hidden">
        <SearchInput searchQuery={searchQuery} onSearchQueryChange={onSearchQueryChange} />
      </div>

      {/* 桌面侧栏:B3-② 独角数卡卡片式(搜索 + 分类 + 标签同卡) */}
      <aside className="hidden lg:block">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-card dark:border-white/10 dark:bg-[#1c1c1e] dark:shadow-2xl">
          <div className="mb-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              搜索
            </span>
            <div className="mt-2.5">
              <SearchInput
                searchQuery={searchQuery}
                onSearchQueryChange={onSearchQueryChange}
              />
            </div>
          </div>

          <h2 className={classNames('mb-3', SIDEBAR_HEADING)}>
            <span className={SIDEBAR_HEADING_BAR} aria-hidden />
            分类
          </h2>
          <ul className="space-y-2">
            <li>
              <button
                type="button"
                onClick={() => onSelectCategory(null)}
                aria-current={selectedCategoryId === null ? 'true' : undefined}
                className={classNames(
                  SIDEBAR_ITEM_BASE,
                  selectedCategoryId === null ? SIDEBAR_ITEM_ACTIVE : SIDEBAR_ITEM_IDLE
                )}
              >
                <span className="truncate">全部商品</span>
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
                  aria-current={selectedCategoryId === category.id ? 'true' : undefined}
                  className={classNames(
                    SIDEBAR_ITEM_BASE,
                    selectedCategoryId === category.id
                      ? SIDEBAR_ITEM_ACTIVE
                      : SIDEBAR_ITEM_IDLE
                  )}
                >
                  <span className="truncate">{category.name}</span>
                </button>
              </li>
            ))}
          </ul>

          {hasTags ? (
            <div className="mt-5 border-t border-neutral-100 pt-4 dark:border-white/10">
              <h2 className={classNames('mb-3', SIDEBAR_HEADING)}>
                <span className={SIDEBAR_HEADING_BAR} aria-hidden />
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
          全部商品
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
