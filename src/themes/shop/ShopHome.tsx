import ContainerLayout from '@/src/components/post/ContainerLayout'
import { WidgetCollection } from '@/src/components/section/WidgetCollection'
import { ThemeHomeProps } from '../types'
import { ShopPostCard } from './ShopPostCard'
import { ShopProductsSection } from './ShopProductsSection'

/**
 * shop(商城)主题首页:走默认 BlogLayout 壳层(Navbar + Footer),
 * Widget/贩售机等挂载沿用现有机制。
 * 「全部商品」= 本站商户商品集合(主站 products-public,客户端加载);
 * 下方文章以商品化卡片网格展示。
 */
export const ShopHome = ({
  posts,
  widgets,
  vendingConfig,
  vendingEnabled,
  galleryFeedCovers,
}: ThemeHomeProps) => (
  <>
    <ContainerLayout>
      <WidgetCollection
        widgets={widgets}
        vendingConfig={vendingConfig}
        vendingEnabled={vendingEnabled !== false}
      />
      <ShopProductsSection />
      <div data-aos="fade-up" data-aos-delay={300}>
        <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
          全部文章
        </h2>
      </div>
    </ContainerLayout>
    <div className="mx-auto w-screen-lg max-w-full px-4 md:px-6">
      {posts.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-500 dark:text-neutral-400">
          暂无内容
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 pb-16 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <ShopPostCard
              key={post.id}
              post={post}
              galleryCoverSrc={galleryFeedCovers?.[post.slug] ?? null}
            />
          ))}
        </div>
      )}
    </div>
  </>
)
