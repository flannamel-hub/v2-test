import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchMerchantProducts } from '@/src/lib/shop/merchantProducts'

/**
 * P18-C2:shop 主题前台「全部商品」数据源(公开只读,无鉴权)。
 *
 * 商品数据经主站 products-public 端点(MERCHANT_API_BASE 等 env)读取,
 * 返回字段已经白名单收敛(sku/name/price/status),无敏感信息。
 * 未配置/主站不可达时 available:false,前台隐藏商品区,不阻断页面。
 * 短缓存降低主站压力:CDN 120s + stale-while-revalidate。
 */

type ShopProductsResponse = {
  success: boolean
  available: boolean
  products: Awaited<ReturnType<typeof fetchMerchantProducts>>['products']
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ShopProductsResponse>
) {
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      success: false,
      available: false,
      products: [],
      error: 'Method not allowed',
    })
  }

  const result = await fetchMerchantProducts()
  return res.status(200).json({
    success: true,
    available: result.available,
    products: result.products,
    ...(result.error ? { error: result.error } : {}),
  })
}
