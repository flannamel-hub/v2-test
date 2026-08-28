/**
 * P18-C2:主站(pro-merchant-v3)products-public 商品列表 fetch 封装。
 * 从 /api/admin/merchant-products(P18-C1)提取,供后台代理与前台商店页共用。
 *
 * - MERCHANT_API_BASE:主站网关地址(如 https://creator.proplus.onl)
 * - MERCHANT_PRODUCTS_PATH:默认 /api/merchant/products-public
 * - MERCHANT_API_TOKEN:可选服务端凭据,存在时以 Bearer 头透传
 * - 未配置 base / 主站不可达 / 返回异常时 available:false 降级,不阻断调用方
 */

export type MerchantProduct = {
  sku: string
  name: string
  price?: string | null
  status?: string | null
}

export type MerchantProductsResult = {
  available: boolean
  products: MerchantProduct[]
  source?: string
  error?: string
}

export type MerchantProductLookupResult = {
  /** true=主站接口可达(结果具权威性);false=接口异常/未配置,结果不可作为清除依据 */
  available: boolean
  product: MerchantProduct | null
  source?: string
  error?: string
}

/** 主站返回字段白名单收敛(sku/name/price/status),其余字段一律丢弃 */
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
    const priceRaw =
      [record.price, record.price_display]
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

/** 服务端读取主站商品列表(8s 超时;任何失败均降级 available:false) */
export async function fetchMerchantProducts(): Promise<MerchantProductsResult> {
  const base = (process.env.MERCHANT_API_BASE || '').trim().replace(/\/+$/, '')
  const path = (
    process.env.MERCHANT_PRODUCTS_PATH || '/api/merchant/products-public'
  ).trim()
  const token = (process.env.MERCHANT_API_TOKEN || '').trim()

  if (!base) {
    return {
      available: false,
      products: [],
      error: '未配置 MERCHANT_API_BASE,无法读取主站商品列表',
    }
  }

  const source = `${base}${path.startsWith('/') ? path : `/${path}`}`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const upstream = await fetch(source, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))

    if (!upstream.ok) {
      return {
        available: false,
        products: [],
        source,
        error: `主站商品接口返回 HTTP ${upstream.status}`,
      }
    }

    const payload = (await upstream.json()) as unknown
    return {
      available: true,
      products: normalizeProducts(extractProductsArray(payload)),
      source,
    }
  } catch (error) {
    return {
      available: false,
      products: [],
      source,
      error: error instanceof Error ? error.message : '主站商品接口请求失败',
    }
  }
}

/** 已下架类状态关键词(命中即视为不可售;status 为空/未知按在售处理) */
const OFF_SALE_STATUS_RE =
  /off[-_ ]?sale|offsale|off-shelf|下架|停售|discontinued|inactive|unavailable|disabled/i

/** P18-C4-5:商品当前是否可售(主站 status 词表未知,空/未识别状态保守按在售) */
export function isMerchantProductOnSale(product: MerchantProduct): boolean {
  const status = (product?.status || '').trim()
  if (!status) return true
  return !OFF_SALE_STATUS_RE.test(status)
}

/**
 * P18-C4-5:按 sku 精确查询系统商品(Step7 商品码联动)。
 * GET ${MERCHANT_API_BASE}${MERCHANT_PRODUCTS_PATH}?sku=xxx(8s 超时,Bearer 可选)。
 * - 主站可达:available:true,product=按 sku(忽略大小写)匹配的商品(无匹配为 null)
 * - 未配置 base / HTTP 非 200 / 超时 / 网络异常:available:false 降级,不抛错
 * - token 仅在服务端使用,绝不回传浏览器
 */
export async function fetchMerchantProductBySku(
  sku: string
): Promise<MerchantProductLookupResult> {
  const trimmed = (sku || '').trim()
  if (!trimmed) {
    return { available: false, product: null, error: '商品码为空,无法查询系统商品' }
  }
  const base = (process.env.MERCHANT_API_BASE || '').trim().replace(/\/+$/, '')
  const path = (
    process.env.MERCHANT_PRODUCTS_PATH || '/api/merchant/products-public'
  ).trim()
  const token = (process.env.MERCHANT_API_TOKEN || '').trim()

  if (!base) {
    return {
      available: false,
      product: null,
      error: '未配置 MERCHANT_API_BASE,无法查询系统商品',
    }
  }

  const source = `${base}${path.startsWith('/') ? path : `/${path}`}?sku=${encodeURIComponent(trimmed)}`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const upstream = await fetch(source, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer))

    if (!upstream.ok) {
      return {
        available: false,
        product: null,
        source,
        error: `主站商品接口返回 HTTP ${upstream.status}`,
      }
    }

    const payload = (await upstream.json()) as unknown
    const lowered = trimmed.toLowerCase()
    const product =
      normalizeProducts(extractProductsArray(payload)).find(
        (p) => p.sku.trim().toLowerCase() === lowered
      ) || null
    return { available: true, product, source }
  } catch (error) {
    return {
      available: false,
      product: null,
      source,
      error: error instanceof Error ? error.message : '主站商品接口请求失败',
    }
  }
}
