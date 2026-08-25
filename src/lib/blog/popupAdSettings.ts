import type {
  PageObjectResponse,
  PartialDatabaseObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'
import {
  POPUP_AD_WIDGET_SLUG,
  PopupAdConfig,
  createDefaultPopupAdConfig,
  normalizePopupAdText,
  normalizePopupAdUrl,
} from '@/src/lib/blog/popupAdDefaults'
import { getDatabaseMetadata, getWidgetPages } from '@/src/lib/notion/getDatabase'
import { databaseId, notion } from '@/src/lib/notion/notion'
import {
  findNotionPropertyKey,
  normalizeMediaUrl,
  pickNotionProperty,
  readNotionCoverUrl,
  readRichTextPlain,
} from '@/src/lib/notion/readProperty'
import { getImageHostConfig } from '@/src/lib/media/imageHostConfig'

const DEFAULT_STATUS_ENABLED = false

// P11-C5: 串行化保存——并发双击时后到请求等前一保存完成后再按 slug 查重（存在→更新），避免重复建页
let updateTurn: Promise<void> = Promise.resolve()
const acquireUpdateTurn = () => {
  const prev = updateTurn
  let release: () => void
  updateTurn = new Promise<void>((resolve) => {
    release = resolve
  })
  return prev.then(() => release!)
}
const BUTTON_TEXT_NAMES = [
  'button_text',
  'buttonText',
  'Button Text',
  'ButtonText',
  '按钮文字',
]
const BUTTON_URL_NAMES = [
  'button_url',
  'buttonUrl',
  'Button URL',
  'Button Url',
  'ButtonUrl',
  '按钮链接',
  '跳转链接',
]
const IMAGE_NAMES = ['cover', 'Cover', 'COVER', '封面', 'image', 'Image']

async function ensurePopupAdSchema(
  dbProps: PartialDatabaseObjectResponse['properties']
): Promise<PartialDatabaseObjectResponse['properties']> {
  const missingProperties: Record<string, any> = {}

  if (!findNotionPropertyKey(dbProps as any, BUTTON_TEXT_NAMES)) {
    missingProperties.button_text = { rich_text: {} }
  }
  if (!findNotionPropertyKey(dbProps as any, BUTTON_URL_NAMES)) {
    missingProperties.button_url = { url: {} }
  }

  if (!databaseId || Object.keys(missingProperties).length === 0) {
    return dbProps
  }

  try {
    await notion.databases.update({
      database_id: databaseId,
      properties: missingProperties,
    } as any)
    const updatedDb = await getDatabaseMetadata()
    return updatedDb.properties || dbProps
  } catch (error) {
    console.warn(
      '[popupAdSettings] schema update failed, optional button fields may be ignored:',
      error instanceof Error ? error.message : error
    )
    return dbProps
  }
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

function readPlainText(prop: PageObjectResponse['properties'][string] | undefined) {
  if (!prop) return ''
  if (prop.type === 'rich_text') {
    return prop.rich_text.map((t) => t.plain_text).join('').trim()
  }
  if (prop.type === 'url') return prop.url || ''
  if (prop.type === 'title') return prop.title.map((t) => t.plain_text).join('').trim()
  return ''
}

function readPopupAdFromPage(page: PageObjectResponse): PopupAdConfig {
  const props = page.properties
  const statusName = readSelectOrStatusName(props.status)
  const enabled = statusName
    ? statusName === 'Published'
    : DEFAULT_STATUS_ENABLED
  const image =
    readNotionCoverUrl(pickNotionProperty(props, IMAGE_NAMES)) ||
    normalizeMediaUrl(readPlainText(pickNotionProperty(props, IMAGE_NAMES))) ||
    ''

  return {
    id: page.id,
    enabled,
    title: normalizePopupAdText(
      readTitle(props.title) || readTitle(props.Page) || '',
      120
    ),
    content: normalizePopupAdText(readRichTextPlain(props.excerpt) || ''),
    image: image || '',
    buttonText: normalizePopupAdText(
      readPlainText(pickNotionProperty(props, BUTTON_TEXT_NAMES)),
      80
    ),
    buttonUrl: normalizePopupAdUrl(
      readPlainText(pickNotionProperty(props, BUTTON_URL_NAMES))
    ),
    source: 'notion',
  }
}

async function findPopupAdWidget(
  widgetPages?: PageObjectResponse[]
): Promise<PageObjectResponse | null> {
  const pages = widgetPages ?? (await getWidgetPages())
  return (
    pages.find((page) => {
      const type = page.properties.type
      return (
        type?.type === 'select' &&
        type.select?.name === 'Widget' &&
        readRichTextPlain(page.properties.slug) === POPUP_AD_WIDGET_SLUG
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

function applyOptionalTextProperty(
  properties: Record<string, any>,
  dbProps: PartialDatabaseObjectResponse['properties'],
  names: string[],
  value: string
) {
  const key = findNotionPropertyKey(dbProps as any, names)
  if (!key) return
  const config = (dbProps as Record<string, any>)[key]
  if (config?.type === 'url') {
    properties[key] = { url: value || null }
  } else if (config?.type === 'title') {
    properties[key] = value ? { title: [{ text: { content: value } }] } : { title: [] }
  } else {
    properties[key] = richText(value)
  }
}

function applyImageProperty(
  properties: Record<string, any>,
  dbProps: PartialDatabaseObjectResponse['properties'],
  image: string
) {
  const key = findNotionPropertyKey(dbProps as any, IMAGE_NAMES)
  if (!key) return
  const config = (dbProps as Record<string, any>)[key]
  if (config?.type === 'url') {
    properties[key] = { url: image || null }
  } else if (config?.type === 'files') {
    properties[key] = {
      files: image
        ? [
            {
              name: 'popup-ad',
              type: 'external',
              external: { url: image },
            },
          ]
        : [],
    }
  } else {
    properties[key] = richText(image)
  }
}

function buildPopupAdProperties(
  dbProps: PartialDatabaseObjectResponse['properties'],
  config: PopupAdConfig
) {
  const titleKey = resolveTitleKey(dbProps)
  const properties: Record<string, any> = {
    [titleKey]: {
      title: [{ text: { content: config.title || '弹窗广告' } }],
    },
    slug: { rich_text: [{ text: { content: POPUP_AD_WIDGET_SLUG } }] },
    excerpt: richText(config.content),
    type: { select: { name: 'Widget' } },
    status: resolveStatusProperty(dbProps, config.enabled),
  }

  applyImageProperty(properties, dbProps, config.image)
  applyOptionalTextProperty(properties, dbProps, BUTTON_TEXT_NAMES, config.buttonText)
  applyOptionalTextProperty(properties, dbProps, BUTTON_URL_NAMES, config.buttonUrl)

  return properties
}

export async function getPopupAdConfig(
  widgetPages?: PageObjectResponse[]
): Promise<PopupAdConfig> {
  await getImageHostConfig()
  try {
    const widget = await findPopupAdWidget(widgetPages)
    if (widget) return readPopupAdFromPage(widget)
  } catch (error) {
    console.warn(
      '[popupAdSettings] Notion widget lookup failed:',
      error instanceof Error ? error.message : error
    )
  }
  return createDefaultPopupAdConfig()
}

export async function updatePopupAdConfig(
  input: Partial<PopupAdConfig>
): Promise<PopupAdConfig> {
  const current = await getPopupAdConfig()
  const next: PopupAdConfig = {
    ...createDefaultPopupAdConfig(),
    ...current,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    title: normalizePopupAdText(input.title ?? current.title, 120),
    content: normalizePopupAdText(input.content ?? current.content),
    image:
      normalizeMediaUrl(input.image ?? current.image) ||
      normalizePopupAdUrl(input.image ?? current.image),
    buttonText: normalizePopupAdText(input.buttonText ?? current.buttonText, 80),
    buttonUrl: normalizePopupAdUrl(input.buttonUrl ?? current.buttonUrl),
    source: 'notion',
  }

  if (next.enabled && !next.buttonUrl) {
    throw new Error('开启弹窗广告前请填写有效的跳转链接（http(s) 或 / 开头）')
  }

  const db = await getDatabaseMetadata()
  const dbProps = await ensurePopupAdSchema(db.properties || {})
  const properties = buildPopupAdProperties(dbProps, next)

  const release = await acquireUpdateTurn()
  try {
    // P11-C5: 查重在串行临界区内进行——并发双击时后到请求能查到先建页，转 update 不再 create
    const existing = await findPopupAdWidget()
    if (existing) {
      await notion.pages.update({
        page_id: existing.id,
        properties,
      })
    } else {
      if (!databaseId) throw new Error('文章数据服务尚未配置，请联系管理')
      await notion.pages.create({
        parent: { database_id: databaseId },
        properties,
      })
    }
  } finally {
    release()
  }

  const updated = await findPopupAdWidget()
  return updated
    ? readPopupAdFromPage(updated)
    : { ...next, id: existing?.id ?? null }
}
