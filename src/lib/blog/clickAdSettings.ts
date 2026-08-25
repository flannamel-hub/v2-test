import type {
  PageObjectResponse,
  PartialDatabaseObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'
import {
  CLICK_AD_WIDGET_SLUG,
  ClickAdConfig,
  createDefaultClickAdConfig,
  normalizeClickAdText,
  normalizeClickAdUrl,
} from '@/src/lib/blog/clickAdDefaults'
import { getDatabaseMetadata, getWidgetPages } from '@/src/lib/notion/getDatabase'
import { databaseId, notion } from '@/src/lib/notion/notion'
import { readRichTextPlain } from '@/src/lib/notion/readProperty'

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

function readClickAdFromPage(page: PageObjectResponse): ClickAdConfig {
  const props = page.properties
  const statusName = readSelectOrStatusName(props.status)
  const enabled = statusName
    ? statusName === 'Published'
    : DEFAULT_STATUS_ENABLED

  return {
    id: page.id,
    enabled,
    title: normalizeClickAdText(
      readTitle(props.title) || readTitle(props.Page) || '',
      120
    ),
    url: normalizeClickAdUrl(readRichTextPlain(props.excerpt) || ''),
    source: 'notion',
  }
}

async function findClickAdWidget(
  widgetPages?: PageObjectResponse[]
): Promise<PageObjectResponse | null> {
  const pages = widgetPages ?? (await getWidgetPages())
  return (
    pages.find((page) => {
      const type = page.properties.type
      return (
        type?.type === 'select' &&
        type.select?.name === 'Widget' &&
        readRichTextPlain(page.properties.slug) === CLICK_AD_WIDGET_SLUG
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

function buildClickAdProperties(
  dbProps: PartialDatabaseObjectResponse['properties'],
  config: ClickAdConfig
) {
  const titleKey = resolveTitleKey(dbProps)
  return {
    [titleKey]: {
      title: [{ text: { content: config.title || '遮罩广告' } }],
    },
    slug: { rich_text: [{ text: { content: CLICK_AD_WIDGET_SLUG } }] },
    excerpt: richText(config.url),
    type: { select: { name: 'Widget' } },
    status: resolveStatusProperty(dbProps, config.enabled),
  }
}

export async function getClickAdConfig(
  widgetPages?: PageObjectResponse[]
): Promise<ClickAdConfig> {
  try {
    const widget = await findClickAdWidget(widgetPages)
    if (widget) return readClickAdFromPage(widget)
  } catch (error) {
    console.warn(
      '[clickAdSettings] Notion widget lookup failed:',
      error instanceof Error ? error.message : error
    )
  }
  return createDefaultClickAdConfig()
}

export async function updateClickAdConfig(
  input: Partial<ClickAdConfig>
): Promise<ClickAdConfig> {
  const current = await getClickAdConfig()
  const next: ClickAdConfig = {
    ...createDefaultClickAdConfig(),
    ...current,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : current.enabled,
    title: normalizeClickAdText(input.title ?? current.title, 120),
    url: normalizeClickAdUrl(input.url ?? current.url),
    source: 'notion',
  }

  if (next.enabled && !next.url) {
    throw new Error('开启遮罩广告前请填写有效的广告链接（http(s) 或 / 开头）')
  }

  const db = await getDatabaseMetadata()
  const dbProps = db.properties || {}
  const properties = buildClickAdProperties(dbProps, next)

  const release = await acquireUpdateTurn()
  try {
    // P11-C5: 查重在串行临界区内进行——并发双击时后到请求能查到先建页，转 update 不再 create
    const existing = await findClickAdWidget()
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

  const updated = await findClickAdWidget()
  return updated
    ? readClickAdFromPage(updated)
    : { ...next, id: existing?.id ?? null }
}
