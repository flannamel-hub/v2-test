import type {
  PageObjectResponse,
  PartialDatabaseObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'
import {
  SHOP_BANNER_WIDGET_SLUG,
  ShopBannerConfig,
  createDefaultShopBannerConfig,
  joinShopBannerImageList,
  normalizeShopBannerLink,
  splitShopBannerImageList,
} from '@/src/lib/blog/shopBannerDefaults'
import { getDatabaseMetadata, getWidgetPages } from '@/src/lib/notion/getDatabase'
import { databaseId, notion } from '@/src/lib/notion/notion'
import { normalizeMediaUrl, readRichTextPlain } from '@/src/lib/notion/readProperty'
import { getImageHostConfig } from '@/src/lib/media/imageHostConfig'

const DEFAULT_STATUS_ENABLED = false
const MAX_IMAGES = 8

// P11-C5: 串行化保存——并发双击时后到请求等前一保存完成后再按 slug 查重(存在→更新),避免重复建页
let updateTurn: Promise<void> = Promise.resolve()
const acquireUpdateTurn = () => {
  const prev = updateTurn
  let release: () => void
  updateTurn = new Promise<void>((resolve) => {
    release = resolve
  })
  return prev.then(() => release!)
}

function readTitle(prop: PageObjectResponse['properties'][string] | undefined) {
  if (!prop || prop.type !== 'title') return null
  const text = prop.title.map((t) => t.plain_text).join('').trim()
  return text || null
}

function readSelectOrStatusName(
  prop: PageObjectResponse['properties'][string] | undefined
) {
  if (!prop) return ''
  if (prop.type === 'status') return prop.status?.name || ''
  if (prop.type === 'select') return prop.select?.name || ''
  return ''
}

function readShopBannerFromPage(page: PageObjectResponse): ShopBannerConfig {
  const props = page.properties
  const statusName = readSelectOrStatusName(props.status)
  const enabled = statusName ? statusName === 'Published' : DEFAULT_STATUS_ENABLED

  const images = splitShopBannerImageList(
    readTitle(props.title) || readTitle(props.Page) || ''
  )
    .map((url) => normalizeMediaUrl(url) || '')
    .filter(Boolean)

  return {
    id: page.id,
    enabled,
    images,
    link: normalizeShopBannerLink(readRichTextPlain(props.excerpt) || ''),
    source: 'notion',
  }
}

async function findShopBannerWidget(
  widgetPages?: PageObjectResponse[]
): Promise<PageObjectResponse | null> {
  const pages = widgetPages ?? (await getWidgetPages())
  return (
    pages.find((page) => {
      const type = page.properties.type
      return (
        type?.type === 'select' &&
        type.select?.name === 'Widget' &&
        readRichTextPlain(page.properties.slug) === SHOP_BANNER_WIDGET_SLUG
      )
    }) || null
  )
}

function resolveTitleKey(dbProps: PartialDatabaseObjectResponse['properties']) {
  const props = dbProps as Record<string, any>
  if (props.title?.type === 'title') return 'title'
  if (props.Page?.type === 'title') return 'Page'
  return 'title'
}

function resolveStatusProperty(
  dbProps: PartialDatabaseObjectResponse['properties'],
  enabled: boolean
) {
  const name = enabled ? 'Published' : 'Hidden'
  const props = dbProps as Record<string, any>
  if (props.status?.type === 'status') {
    return { status: { name } }
  }
  return { select: { name } }
}

function richText(content: string) {
  return content
    ? { rich_text: [{ text: { content } }] }
    : { rich_text: [] }
}

function buildShopBannerProperties(
  dbProps: PartialDatabaseObjectResponse['properties'],
  config: ShopBannerConfig
) {
  const titleKey = resolveTitleKey(dbProps)
  return {
    [titleKey]: {
      title: [{ text: { content: joinShopBannerImageList(config.images) } }],
    },
    slug: { rich_text: [{ text: { content: SHOP_BANNER_WIDGET_SLUG } }] },
    excerpt: richText(config.link),
    type: { select: { name: 'Widget' } },
    status: resolveStatusProperty(dbProps, config.enabled),
  }
}

export async function getShopBannerConfig(
  widgetPages?: PageObjectResponse[]
): Promise<ShopBannerConfig> {
  await getImageHostConfig()
  try {
    const widget = await findShopBannerWidget(widgetPages)
    if (widget) return readShopBannerFromPage(widget)
  } catch (error) {
    console.warn(
      '[shopBannerSettings] Notion widget lookup failed:',
      error instanceof Error ? error.message : error
    )
  }
  return createDefaultShopBannerConfig()
}

export async function updateShopBannerConfig(
  input: Partial<ShopBannerConfig>
): Promise<ShopBannerConfig> {
  const current = await getShopBannerConfig()
  const rawImages = Array.isArray(input.images)
    ? input.images
    : current.images
  const images = rawImages
    .map((url) => normalizeMediaUrl(url) || '')
    .filter(Boolean)
    .slice(0, MAX_IMAGES)
  const next: ShopBannerConfig = {
    ...createDefaultShopBannerConfig(),
    ...current,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    images,
    link: normalizeShopBannerLink(input.link ?? current.link),
    source: 'notion',
  }

  if (next.enabled && next.images.length === 0) {
    throw new Error('开启 Banner 前请至少填写一张有效的图片地址(http(s) 直链)')
  }

  const db = await getDatabaseMetadata()
  const dbProps = db.properties || {}
  const properties = buildShopBannerProperties(dbProps, next)

  const release = await acquireUpdateTurn()
  let existing: PageObjectResponse | null = null
  try {
    // P11-C5: 查重在串行临界区内进行——并发双击时后到请求能查到先建页,转 update 不再 create
    existing = await findShopBannerWidget()
    if (existing) {
      await notion.pages.update({
        page_id: existing.id,
        properties,
      })
    } else {
      if (!databaseId) throw new Error('文章数据服务尚未配置,请联系管理')
      await notion.pages.create({
        parent: { database_id: databaseId },
        properties,
      })
    }
  } finally {
    release()
  }

  const updated = await findShopBannerWidget()
  return updated
    ? readShopBannerFromPage(updated)
    : { ...next, id: existing?.id ?? null }
}
