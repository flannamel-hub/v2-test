import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyAdminRequest } from '@/src/lib/admin/verifyAdminRequest'

/**
 * P18-C1:商户商品列表代理（BLOG 后台「关联商品」下拉数据源）。
 *
 * 仅 BLOG 后台浏览器调用（verifyAdminRequest 鉴权）。
 * 商品数据不在 v2-test 本地，统一经主站（pro-merchant-v3）读取：
 *   GET ${MERCHANT_API_BASE}${MERCHANT_PRODUCTS_PATH}
 *   - MERCHANT_API_BASE：主站网关地址（如 https://creator.proplus.onl）
 *   - MERCHANT_PRODUCTS_PATH：默认 /api/merchant/products-public（主站待补，见 P18 报告依赖项）
 *   - MERCHANT_API_TOKEN：可选服务端凭据，存在时以 Bearer 头透传给主站
 * 主站未部署该端点时返回 available:false（HTTP 200），后台降级为手填 SKU，
 * 不阻断文章保存。
 */

type MerchantProduct = {
  sku: string
  name: string
  price?: string | null
  status?: string | null
}

type MerchantProductsResponse = {
  success: boolean
  available: boolean
  products: MerchantProduct[]
  source?: string
  error?: string
}

/** 主站返回字段白名单收敛（sku/name/price/status），其余字段一律丢弃 */
function normalizeProducts(raw: unknown): MerchantProduct[] {
  if (!Array.isArray(raw)) return []
  const products: MerchantProduct[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const sku = [record.sku, record.id, record.product_id]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .find((v) => v.length > 0)
    if (!sku) continue
    const name =
      [record.name, record.title]
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .find((v) => v.length > 0) ?? sku
    const priceRaw = [record.price, record.price_display]
      .map((v) =>
        typeof v === 'number'
          ? String(v)
          : typeof v === 'string' && v.trim()
            ? v.trim()
            : null
      )
      .find((v) => v != null) ?? null
    const status =
      typeof record.status === 'string' && record.status.trim()
        ? record.status.trim()
        : null
    products.push({ sku, name, price: priceRaw, status })
  }
  return products
}

function extractProductsArray(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  for (const key of ['products', 'items', 'data', 'list']) {
    if (Array.isArray(record[key])) return record[key]
  }
  return null
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

  const base = (process.env.MERCHANT_API_BASE || '').trim().replace(/\/+$/, '')
  const path = (
    process.env.MERCHANT_PRODUCTS_PATH || '/api/merchant/products-public'
  ).trim()
  const token = (process.env.MERCHANT_API_TOKEN || '').trim()

  if (!base) {
    return res.status(200).json({
      success: true,
      available: false,
      products: [],
      error: '未配置 MERCHANT_API_BASE，无法读取主站商品列表',
    })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const upstream = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))

    if (!upstream.ok) {
      // 404 = 主站尚未部署 products-public 端点（P18-C1 依赖项），降级不阻断
      return res.status(200).json({
        success: true,
        available: false,
        products: [],
        source: `${base}${path}`,
        error: `主站商品接口返回 HTTP ${upstream.status}`,
      })
    }

    const payload = (await upstream.json()) as unknown
    const products = normalizeProducts(extractProductsArray(payload))
    return res.status(200).json({
      success: true,
      available: true,
      products,
      source: `${base}${path}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '主站商品接口请求失败'
    return res.status(200).json({
      success: true,
      available: false,
      products: [],
      source: `${base}${path}`,
      error: message,
    })
  }
}
