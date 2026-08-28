import { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { RichTextItemResponse } from '@notionhq/client/build/src/api-endpoints'
import {
  getRuntimeImageHostConfig,
  rewriteManagedAssetUrl,
} from '@/src/lib/media/rewriteManagedAssetUrl'

/** 合并 Notion rich_text / title 数组为完整 plain text（保留段内与段间空格） */
export function joinRichTextPlain(
  items: RichTextItemResponse[] | undefined | null,
  options?: { splitRunsWithSpace?: boolean }
): string {
  if (!items?.length) return ''
  const parts = items.map((t) => t.plain_text)
  const raw = parts.join('')
  if (!options?.splitRunsWithSpace) return raw
  // Notion 有时将各词拆成独立 run 且 run 之间无空格字符，直接 join 会得到 CosGallery
  if (/\s/.test(raw) || items.length <= 1) return raw.trim()
  return parts.map((p) => p.trim()).filter(Boolean).join(' ')
}

/** 读取 Notion rich_text 属性全文（支持多段 rich_text） */
export function readRichTextPlain(
  prop: PageObjectResponse['properties'][string] | undefined
): string | null {
  if (!prop || prop.type !== 'rich_text') return null
  const text = prop.rich_text.map((t) => t.plain_text).join('').trim()
  return text || null
}

/** 将图床 / 外链地址规范为可请求的 https URL（兼容无协议写法） */
export function normalizeMediaUrl(
  raw: string | null | undefined
): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  if (s.startsWith('https://') || s.startsWith('http://')) {
    return rewriteManagedAssetUrl(s, getRuntimeImageHostConfig())
  }
  if (s.startsWith('//')) {
    return rewriteManagedAssetUrl(`https:${s}`, getRuntimeImageHostConfig())
  }
  if (/^[a-zA-Z0-9][-a-zA-Z0-9.]*(?:\/|$)/.test(s)) {
    return rewriteManagedAssetUrl(
      `https://${s.replace(/^\/+/, '')}`,
      getRuntimeImageHostConfig()
    )
  }
  return null
}

/** 读取 Notion cover 字段（url / files / rich_text） */
export function readNotionCoverUrl(
  prop: PageObjectResponse['properties'][string] | undefined
): string | null {
  if (!prop || typeof prop !== 'object' || !('type' in prop)) return null

  if (prop.type === 'url') {
    return normalizeMediaUrl(prop.url)
  }

  if (prop.type === 'rich_text') {
    return normalizeMediaUrl(
      prop.rich_text.map((t) => t.plain_text).join('').trim()
    )
  }

  if (prop.type === 'files' && prop.files?.length) {
    for (const file of prop.files) {
      if (file.type === 'external' && file.external?.url) {
        const url = normalizeMediaUrl(file.external.url)
        if (url) return url
      }
      if (file.type === 'file' && file.file?.url) {
        const url = normalizeMediaUrl(file.file.url)
        if (url) return url
      }
    }
  }

  return null
}

/** 读取 Notion 页面级 cover（与数据库 cover 属性不同） */
export function readPageCoverUrl(
  cover: PageObjectResponse['cover']
): string | null {
  if (!cover) return null
  if (cover.type === 'external') {
    return normalizeMediaUrl(cover.external.url)
  }
  if (cover.type === 'file') {
    return normalizeMediaUrl(cover.file.url)
  }
  return null
}

export const COVER_PROPERTY_NAMES = ['cover', 'Cover', 'COVER', '封面']
const COVER_DARK_PROPERTY_NAMES = ['cover_dark', 'Cover Dark', 'coverDark', 'Cover_Dark']

export const DOWNLOAD_SIZE_PROPERTY_NAMES = [
  'download_size',
  'Download_size',
  'downloadSize',
  'Download Size',
  '资源包大小',
  '资源大小',
]

export const DOWNLOAD_COUNT_PROPERTY_NAMES = [
  'download_count',
  'Download_count',
  'downloadCount',
  '下载信息（数量）',
  '下载数量',
]

export const ARTICLE_PASSWORD_PROPERTY_NAMES = [
  'article_password',
  'Article_password',
  'articlePassword',
  '文章密码',
  '访问密码',
]

/** shop 主题文章关联商品 SKU（select / rich_text / url 均可读） */
export const LINKED_PRODUCT_SKU_PROPERTY_NAMES = [
  'linked_product_sku',
  'Linked_product_sku',
  'linkedProductSku',
  'Linked_Product_Sku',
  '关联商品',
]

/** shop 主题商品购买链接（P18-C3 人工挂链；url / rich_text 均可读） */
export const LINKED_PRODUCT_URL_PROPERTY_NAMES = [
  'linked_product_url',
  'Linked_product_url',
  'linkedProductUrl',
  'Linked_Product_Url',
  '商品链接',
]

/** shop 主题商品价格（P18-C3 纯展示；rich_text / url 均可读） */
export const LINKED_PRODUCT_PRICE_PROPERTY_NAMES = [
  'linked_product_price',
  'Linked_product_price',
  'linkedProductPrice',
  'Linked_Product_Price',
  '商品价格',
]

/** shop 主题商品名称（P18C45UI B2 内页展示；rich_text / url 均可读） */
export const LINKED_PRODUCT_NAME_PROPERTY_NAMES = [
  'linked_product_name',
  'Linked_product_name',
  'linkedProductName',
  'Linked_Product_Name',
  '商品名称',
]

export function pickNotionProperty(
  properties: PageObjectResponse['properties'],
  names: string[]
) {
  for (const name of names) {
    if (properties[name]) return properties[name]
  }
  const lowered = new Set(names.map((n) => n.toLowerCase()))
  for (const [key, prop] of Object.entries(properties)) {
    if (lowered.has(key.toLowerCase())) return prop
  }
  return undefined
}

/** 读取页面 properties 中的封面 URL（兼容字段名大小写 / 中文列名） */
export function readCoverFromPageProperties(
  properties: PageObjectResponse['properties']
): string | null {
  return readNotionCoverUrl(
    pickNotionProperty(properties, COVER_PROPERTY_NAMES)
  )
}

export function readCoverDarkFromPageProperties(
  properties: PageObjectResponse['properties']
): string | null {
  return readNotionCoverUrl(
    pickNotionProperty(properties, COVER_DARK_PROPERTY_NAMES)
  )
}

export function readDownloadSizeFromPageProperties(
  properties: PageObjectResponse['properties']
): string {
  return readRichTextPlain(
    pickNotionProperty(properties, DOWNLOAD_SIZE_PROPERTY_NAMES)
  ) ?? ''
}

export function readDownloadCountFromPageProperties(
  properties: PageObjectResponse['properties']
): string {
  return readRichTextPlain(
    pickNotionProperty(properties, DOWNLOAD_COUNT_PROPERTY_NAMES)
  ) ?? ''
}

/** 文章全篇访问密码（Notion article_password）；留空表示不上锁 */
export function readArticlePasswordFromPageProperties(
  properties: PageObjectResponse['properties']
): string {
  return (
    readRichTextPlain(
      pickNotionProperty(properties, ARTICLE_PASSWORD_PROPERTY_NAMES)
    ) ?? ''
  ).trim()
}

export function isArticlePasswordProtectedFromProperties(
  properties: PageObjectResponse['properties']
): boolean {
  return readArticlePasswordFromPageProperties(properties).length > 0
}

/** 读取文章关联商品 SKU（Notion linked_product_sku；select/rich_text/url 兼容），留空表示未关联 */
export function readLinkedProductSkuFromPageProperties(
  properties: PageObjectResponse['properties']
): string {
  const prop = pickNotionProperty(
    properties,
    LINKED_PRODUCT_SKU_PROPERTY_NAMES
  )
  if (!prop || typeof prop !== 'object' || !('type' in prop)) return ''

  if (prop.type === 'select' && prop.select?.name) {
    return String(prop.select.name).trim()
  }
  if (prop.type === 'rich_text') {
    return readRichTextPlain(prop)?.trim() ?? ''
  }
  if (prop.type === 'url' && prop.url) {
    return String(prop.url).trim()
  }
  return ''
}

/** 读取文章商品购买链接（P18-C3 linked_product_url；url/rich_text 兼容），留空表示未填写 */
export function readLinkedProductUrlFromPageProperties(
  properties: PageObjectResponse['properties']
): string {
  const prop = pickNotionProperty(
    properties,
    LINKED_PRODUCT_URL_PROPERTY_NAMES
  )
  if (!prop || typeof prop !== 'object' || !('type' in prop)) return ''

  if (prop.type === 'url' && prop.url) {
    return String(prop.url).trim()
  }
  if (prop.type === 'rich_text') {
    return readRichTextPlain(prop)?.trim() ?? ''
  }
  return ''
}

/** 读取文章商品价格（P18-C3 linked_product_price；rich_text/url 兼容），留空表示未填写 */
export function readLinkedProductPriceFromPageProperties(
  properties: PageObjectResponse['properties']
): string {
  const prop = pickNotionProperty(
    properties,
    LINKED_PRODUCT_PRICE_PROPERTY_NAMES
  )
  if (!prop || typeof prop !== 'object' || !('type' in prop)) return ''

  if (prop.type === 'rich_text') {
    return readRichTextPlain(prop)?.trim() ?? ''
  }
  if (prop.type === 'url' && prop.url) {
    return String(prop.url).trim()
  }
  return ''
}

/** 读取文章商品名称（P18C45UI B2 linked_product_name；rich_text/url 兼容），留空表示未填写 */
export function readLinkedProductNameFromPageProperties(
  properties: PageObjectResponse['properties']
): string {
  const prop = pickNotionProperty(
    properties,
    LINKED_PRODUCT_NAME_PROPERTY_NAMES
  )
  if (!prop || typeof prop !== 'object' || !('type' in prop)) return ''

  if (prop.type === 'rich_text') {
    return readRichTextPlain(prop)?.trim() ?? ''
  }
  if (prop.type === 'url' && prop.url) {
    return String(prop.url).trim()
  }
  return ''
}

export function findNotionPropertyKey(
  properties: PageObjectResponse['properties'],
  names: string[]
): string | undefined {
  for (const name of names) {
    if (properties[name]) return name
  }
  const lowered = new Set(names.map((n) => n.toLowerCase()))
  for (const key of Object.keys(properties)) {
    if (lowered.has(key.toLowerCase())) return key
  }
  return undefined
}
