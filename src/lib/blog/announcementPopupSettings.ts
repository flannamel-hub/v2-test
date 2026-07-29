import type {
  PageObjectResponse,
  PartialDatabaseObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'
import {
  ANNOUNCEMENT_POPUP_WIDGET_SLUG,
  AnnouncementPopupConfig,
  createDefaultAnnouncementPopupConfig,
  normalizeAnnouncementPopupText,
  normalizeAnnouncementPopupUrl,
} from '@/src/lib/blog/announcementPopupDefaults'
import { getDatabaseMetadata, getWidgetPages } from '@/src/lib/notion/getDatabase'
import { databaseId, notion } from '@/src/lib/notion/notion'
import {
  findNotionPropertyKey,
  normalizeMediaUrl,
  pickNotionProperty,
  readNotionCoverUrl,
  readRichTextPlain,
} from '@/src/lib/notion/readProperty'

const DEFAULT_STATUS_ENABLED = false
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

async function ensureAnnouncementPopupSchema(
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
      '[announcementPopupSettings] schema update failed, optional button fields may be ignored:',
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

function readAnnouncementPopupFromPage(
  page: PageObjectResponse
): AnnouncementPopupConfig {
  const props = page.properties
  const statusName = readSelectOrStatusName(props.status)
  const enabled = statusName
    ? statusName === 'Published'
    : DEFAULT_STATUS_ENABLED
  const image =
    readNotionCoverUrl(pickNotionProperty(props, IMAGE_NAMES)) ||
    normalizeMediaUrl(readPlainText(pickNotionProperty(props, IMAGE_NAMES))) ||
    ''
  const buttonText = normalizeAnnouncementPopupText(
    readPlainText(pickNotionProperty(props, BUTTON_TEXT_NAMES)),
    80
  )
  const buttonUrl = normalizeAnnouncementPopupUrl(
    readPlainText(pickNotionProperty(props, BUTTON_URL_NAMES))
  )

  return {
    id: page.id,
    enabled,
    title: normalizeAnnouncementPopupText(
      readTitle(props.title) || readTitle(props.Page) || '',
      120
    ),
    content: normalizeAnnouncementPopupText(readRichTextPlain(props.excerpt) || ''),
    image: image || '',
    buttonText,
    buttonUrl,
    source: 'notion',
  }
}

async function findAnnouncementPopupWidget(
  widgetPages?: PageObjectResponse[]
): Promise<PageObjectResponse | null> {
  const pages = widgetPages ?? (await getWidgetPages())
  return (
    pages.find((page) => {
      const type = page.properties.type
      return (
        type?.type === 'select' &&
        type.select?.name === 'Widget' &&
        readRichTextPlain(page.properties.slug) ===
          ANNOUNCEMENT_POPUP_WIDGET_SLUG
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
              name: 'announcement-popup',
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

function buildAnnouncementPopupProperties(
  dbProps: PartialDatabaseObjectResponse['properties'],
  config: AnnouncementPopupConfig
) {
  const titleKey = resolveTitleKey(dbProps)
  const properties: Record<string, any> = {
    [titleKey]: {
      title: [{ text: { content: config.title || '公告弹窗' } }],
    },
    slug: { rich_text: [{ text: { content: ANNOUNCEMENT_POPUP_WIDGET_SLUG } }] },
    excerpt: richText(config.content),
    type: { select: { name: 'Widget' } },
    status: resolveStatusProperty(dbProps, config.enabled),
  }

  applyImageProperty(properties, dbProps, config.image)
  applyOptionalTextProperty(properties, dbProps, BUTTON_TEXT_NAMES, config.buttonText)
  applyOptionalTextProperty(properties, dbProps, BUTTON_URL_NAMES, config.buttonUrl)

  return properties
}

export async function getAnnouncementPopupConfig(
  widgetPages?: PageObjectResponse[]
): Promise<AnnouncementPopupConfig> {
  try {
    const widget = await findAnnouncementPopupWidget(widgetPages)
    if (widget) return readAnnouncementPopupFromPage(widget)
  } catch (error) {
    console.warn(
      '[announcementPopupSettings] Notion widget lookup failed:',
      error instanceof Error ? error.message : error
    )
  }
  return createDefaultAnnouncementPopupConfig()
}

export async function updateAnnouncementPopupConfig(
  input: Partial<AnnouncementPopupConfig>
): Promise<AnnouncementPopupConfig> {
  const current = await getAnnouncementPopupConfig()
  const next: AnnouncementPopupConfig = {
    ...createDefaultAnnouncementPopupConfig(),
    ...current,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    title: normalizeAnnouncementPopupText(input.title ?? current.title, 120),
    content: normalizeAnnouncementPopupText(input.content ?? current.content),
    image:
      normalizeMediaUrl(input.image ?? current.image) ||
      normalizeAnnouncementPopupUrl(input.image ?? current.image),
    buttonText: normalizeAnnouncementPopupText(
      input.buttonText ?? current.buttonText,
      80
    ),
    buttonUrl: normalizeAnnouncementPopupUrl(input.buttonUrl ?? current.buttonUrl),
    source: 'notion',
  }

  const db = await getDatabaseMetadata()
  const dbProps = await ensureAnnouncementPopupSchema(db.properties || {})
  const existing = await findAnnouncementPopupWidget()
  const properties = buildAnnouncementPopupProperties(dbProps, next)

  if (existing) {
    await notion.pages.update({
      page_id: existing.id,
      properties,
    })
  } else {
    if (!databaseId) throw new Error('未配置 NOTION_PAGE_ID / NOTION_DATABASE_ID')
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties,
    })
  }

  const updated = await findAnnouncementPopupWidget()
  return updated
    ? readAnnouncementPopupFromPage(updated)
    : { ...next, id: existing?.id ?? null }
}
