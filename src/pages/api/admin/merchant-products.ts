import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'
import { fetchMerchantProducts } from '@/src/lib/shop/merchantProducts'

/**
 * P18-C1:商户商品列表代理(BLOG 后台「关联商品」下拉数据源)。
 *
 * 仅 BLOG 后台浏览器调用(verifyAdminRequest 鉴权)。
 * 商品数据不在 v2-test 本地,统一经主站(pro-merchant-v3)读取:
 *   GET ${MERCHANT_API_BASE}${MERCHANT_PRODUCTS_PATH}
 * fetch/字段白名单收敛逻辑在 src/lib/shop/merchantProducts.ts
 * (P18-C2 起与前台商店页共用)。
 * 主站未部署该端点时返回 available:false(HTTP 200),后台降级为手填 SKU,
 * 不阻断文章保存。
 */

type MerchantProductsResponse = {
  success: boolean
  available: boolean
  products: Awaited<ReturnType<typeof fetchMerchantProducts>>['products']
  source?: string
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MerchantProductsResponse>
) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({
      success: false,
      available: false,
      products: [],
      error: 'Method not allowed',
    })
  }

  if (!verifyAdminRequest(req)) {
    return res.status(401).json({
      success: false,
      available: false,
      products: [],
      error: '未授权',
    })
  }

  const result = await fetchMerchantProducts()
  return res.status(200).json({
    success: true,
    available: result.available,
    products: result.products,
    ...(result.source ? { source: result.source } : {}),
    ...(result.error ? { error: result.error } : {}),
  })
}
