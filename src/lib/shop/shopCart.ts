/**
 * P18-C2:shop 主题本地购物车(BLOG 侧 localStorage)。
 *
 * 架构约定:BLOG 域与 store 域 localStorage 不共享 → 购物车仅存本站
 * localStorage(徽标/抽屉用),结算时把条目编码进 URL 传给
 * `{storeUrl}/cart?site={site_id}&items={sku}:{qty},{sku}:{qty}`;
 * BLOG 侧不调用任何结算 API。
 *
 * - 存储 key:shop_cart_v1;结构按 site_id 分组:`{ [siteId]: [{ sku, qty, name, price? }] }`
 * - 所有读写必须走本模块并 try/catch(隐私模式/序列化失败静默降级)
 * - 写入后用 SHOP_CART_CHANGE_EVENT 通知徽标/抽屉刷新
 */

export const SHOP_CART_STORAGE_KEY = 'shop_cart_v1'

/** 购物车变更广播事件(window.dispatchEvent) */
export const SHOP_CART_CHANGE_EVENT = 'shop-cart-change'

export const DEFAULT_STORE_URL = 'https://store.pro-pl.us'

/**
 * 单 SKU 数量上限(P18-C4-3 C2/C3):BLOG 侧拿不到商品库存,
 * 加购合并与手动调整统一封顶 99(徽标 99+ 展示同源)。
 */
export const MAX_CART_QTY = 99

export type ShopCartItem = {
  sku: string
  qty: number
  /** 展示名(取文章标题/商品名) */
  name?: string
  /** 主站返回的价格字符串(如 "29.90");仅展示用 */
  price?: string | null
}

type ShopCartStorage = Record<string, ShopCartItem[]>

/** localStorage 分组键:site_id 为空(本地开发未配 BLOG_SITE_ID)时用固定兜底键 */
function cartGroupKey(siteId: string): string {
  const trimmed = (siteId || '').trim()
  return trimmed || '_site'
}

function parseCartStorage(raw: string | null): ShopCartStorage {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const storage: ShopCartStorage = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue
      const items = value.filter(
        (item): item is ShopCartItem =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as ShopCartItem).sku === 'string' &&
          (item as ShopCartItem).sku.trim().length > 0 &&
          Number.isFinite((item as ShopCartItem).qty)
      )
      if (items.length > 0) storage[key] = items
    }
    return storage
  } catch {
    return {}
  }
}

function readCartStorage(): ShopCartStorage {
  if (typeof window === 'undefined') return {}
  try {
    return parseCartStorage(window.localStorage.getItem(SHOP_CART_STORAGE_KEY))
  } catch {
    return {}
  }
}

function writeCartStorage(storage: ShopCartStorage): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(SHOP_CART_STORAGE_KEY, JSON.stringify(storage))
    return true
  } catch {
    return false
  }
}

/** 读取当前站点购物车(SSR/异常返回空数组) */
export function readCart(siteId: string): ShopCartItem[] {
  return readCartStorage()[cartGroupKey(siteId)] ?? []
}

/** 覆盖写回当前站点购物车,并广播变更事件;返回是否写入成功 */
export function writeCart(siteId: string, items: ShopCartItem[]): boolean {
  if (items.length === 0) {
    // 空车时不留空数组垃圾
    const storage = readCartStorage()
    delete storage[cartGroupKey(siteId)]
    if (Object.keys(storage).length === 0) {
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(SHOP_CART_STORAGE_KEY)
        }
      } catch {
        /* ignore */
      }
    } else {
      writeCartStorage(storage)
    }
    notifyCartChange()
    return true
  }
  const storage = readCartStorage()
  storage[cartGroupKey(siteId)] = items
  const ok = writeCartStorage(storage)
  if (ok) notifyCartChange()
  return ok
}

/** 加入购物车:同 SKU 数量累加、不新增条目(封顶 MAX_CART_QTY);返回该 SKU 当前数量(失败返回 null) */
export function addToCart(siteId: string, item: ShopCartItem): number | null {
  const sku = item.sku.trim()
  if (!sku) return null
  const items = readCart(siteId)
  const existing = items.find((i) => i.sku === sku)
  if (existing) {
    existing.qty = Math.min(MAX_CART_QTY, existing.qty + (item.qty || 1))
    existing.name = item.name || existing.name
    existing.price = item.price ?? existing.price
  } else {
    items.push({
      sku,
      qty: Math.max(1, Math.min(MAX_CART_QTY, Math.round(item.qty || 1))),
      name: item.name,
      price: item.price ?? null,
    })
  }
  return writeCart(siteId, items) ? (existing?.qty ?? items[items.length - 1].qty) : null
}

/** 调整数量(钳制 1..MAX_CART_QTY;qty<=0 视为删除);返回是否变更成功 */
export function updateCartQty(siteId: string, sku: string, qty: number): boolean {
  if (qty <= 0) return removeCartItem(siteId, sku)
  const items = readCart(siteId)
  const existing = items.find((i) => i.sku === sku)
  if (!existing) return false
  existing.qty = Math.min(MAX_CART_QTY, Math.max(1, Math.round(qty)))
  return writeCart(siteId, items)
}

/** 删除单条;返回是否有删除发生 */
export function removeCartItem(siteId: string, sku: string): boolean {
  const items = readCart(siteId)
  const next = items.filter((i) => i.sku !== sku)
  if (next.length === items.length) return false
  writeCart(siteId, next)
  return true
}

/** 清空当前站点购物车 */
export function clearCart(siteId: string): void {
  writeCart(siteId, [])
}

/** 购物车总件数(各条目 qty 之和) */
export function cartTotalQty(items: ShopCartItem[]): number {
  return items.reduce((sum, item) => sum + (Math.max(0, Math.round(item.qty)) || 0), 0)
}

/** 广播购物车变更(徽标/抽屉监听;SSR 安全) */
export function notifyCartChange(): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new Event(SHOP_CART_CHANGE_EVENT))
  } catch {
    /* ignore */
  }
}

let storeUrlWarned = false

/** store 站点地址:env NEXT_PUBLIC_STORE_URL,未配置时用默认值并 warn 一次 */
export function getStoreUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_STORE_URL || '').trim().replace(/\/+$/, '')
  if (raw) return raw
  if (!storeUrlWarned && typeof console !== 'undefined') {
    storeUrlWarned = true
    console.warn(
      `[shop] NEXT_PUBLIC_STORE_URL 未配置,购买/结算按钮使用默认值 ${DEFAULT_STORE_URL}`
    )
  }
  return DEFAULT_STORE_URL
}

/** 商品直达链接:{storeUrl}/p/{sku} */
export function buildProductUrl(storeUrl: string, sku: string): string {
  return `${storeUrl}/p/${encodeURIComponent(sku.trim())}`
}

/**
 * 结算跳转链接:购物车条目编码进 URL。
 * `{storeUrl}/cart?site={site_id}&site_title={title}&items={sku}:{qty},{sku}:{qty}`
 * items 整体 encodeURIComponent,防 SKU 内逗号/冒号/中文破坏结构;
 * site_title(P18C44-B3 D5)为可选站点标题,store 侧结算页展示「站点:xxx」,
 * 为空/空白时不追加该参数(旧链接格式保持不变)。
 */
export function buildCheckoutUrl(
  storeUrl: string,
  siteId: string,
  items: ShopCartItem[],
  siteTitle?: string
): string {
  const itemsParam = items
    .map((item) => {
      const price = parseItemPrice(item.price)
      return `${item.sku.trim()}:${Math.max(1, Math.round(item.qty) || 1)}${price != null ? `:${price}` : ''}`
    })
    .join(',')
  const title = (siteTitle || '').trim()
  const siteTitleParam = title ? `&site_title=${encodeURIComponent(title)}` : ''
  return `${storeUrl}/cart?site=${encodeURIComponent(siteId || '')}&items=${encodeURIComponent(itemsParam)}${siteTitleParam}`
}

/** 解析价格字符串为数字(如 "29.90"/"¥29.90");失败返回 null */
export function parseItemPrice(price?: string | null): number | null {
  if (typeof price !== 'string' || !price.trim()) return null
  const n = parseFloat(price.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : null
}
