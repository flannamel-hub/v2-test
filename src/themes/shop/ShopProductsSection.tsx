import { useEffect, useState } from 'react'
import type { MerchantProduct } from '@/src/lib/shop/merchantProducts'
import { buildProductUrl, getStoreUrl } from '@/src/lib/shop/shopCart'

/**
 * P18-C2:shop 主题首页「全部商品」区(本站商户商品集合展)。
 * 数据经公开端点 /api/shop/products(服务端代理主站 products-public,
 * 复用 P18-C1 的 MERCHANT_* env 配置)客户端加载;主站未配置/不可达或
 * 商品为空时整区不渲染,不阻塞首页。
 * 每卡:名称 / SKU / 价格 /「购买」直达链接({storeUrl}/p/{sku})。
 */

type ShopProductsSectionProps = {
  /** 自定义区块标题(默认「全部商品」) */
  title?: string
}

export function ShopProductsSection({ title = '全部商品' }: ShopProductsSectionProps) {
  const [products, setProducts] = useState<MerchantProduct[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/shop/products')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { available?: boolean; products?: MerchantProduct[] } | null) => {
        if (cancelled) return
        if (data && data.available && Array.isArray(data.products)) {
          setProducts(data.products)
        } else {
          setProducts(null)
        }
      })
      .catch(() => {
        if (!cancelled) setProducts(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!products || products.length === 0) return null

  const storeUrl = getStoreUrl()

  return (
    <section className="mb-10" data-shop-products-section>
      <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <div
            key={product.sku}
            className="flex h-full flex-col justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-card dark:border-white/10 dark:bg-[#1c1c1e] dark:shadow-2xl"
          >
            <div className="min-w-0">
              <h3 className="line-clamp-2 text-lg font-extrabold leading-tight tracking-tight text-neutral-900 dark:text-white">
                {product.name}
              </h3>
              <p className="mt-1.5 truncate font-mono text-xs text-neutral-500 dark:text-neutral-400">
                {product.sku}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-3 dark:border-white/5">
              <span className="text-base font-extrabold text-green-600 dark:text-green-400">
                {product.price ? product.price : '价格以购买页为准'}
              </span>
              <a
                href={buildProductUrl(storeUrl, product.sku)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg bg-neutral-900 px-4 py-1.5 text-xs font-bold text-white transition-colors duration-200 ease-out hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
              >
                购买
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
