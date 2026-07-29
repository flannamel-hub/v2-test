import type {
  PageObjectResponse,
  PartialDatabaseObjectResponse,
} from '@notionhq/client/build/src/api-endpoints'
import {
  DEFAULT_VENDING_TITLE,
  DEFAULT_VENDING_URL,
  VENDING_WIDGET_SLUG,
  normalizeVendingTitle,
  normalizeVendingUrl,
} from '@/src/lib/blog/vendingDefaults'
import type { VendingConfig } from '@/src/lib/blog/vendingDefaults'
import { getBlogSiteIdOrNull } from '@/src/lib/gallery/blogSite'
import { getDatabaseMetadata, getWidgetPages } from '@/src/lib/notion/getDatabase'
import { databaseId, notion } from '@/src/lib/notion/notion'
import { readRichTextPlain } from '@/src/lib/notion/readProperty'
import { getSupabaseAdmin } from '@/src/lib/supabase/admin'

const TABLE = 'blog_site_settings'
const DEFAULT_ENABLED = true

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

function readVendingConfigFromPage(page: PageObjectResponse): VendingConfig {
  const props = page.properties
  const statusName = readSelectOrStatusName(props.status)
  const enabled = statusName ? statusName === 'Published' : DEFAULT_ENABLED
  const title =
    readTitle(props.title) ||
    readTitle(props.Page) ||
    DEFAULT_VENDING_TITLE
  const url = readRichTextPlain(props.excerpt) || DEFAULT_VENDING_URL

  return {
    id: page.id,
    enabled,
    title: normalizeVendingTitle(title),
    url: normalizeVendingUrl(url),
    source: 'notion',
  }
}

async function findVendingWidget(
  widgetPages?: PageObjectResponse[]
): Promise<PageObjectResponse | null> {
  const pages = widgetPages ?? (await getWidgetPages())
  return (
    pages.find((page) => {
      const type = page.properties.type
      return (
        type?.type === 'select' &&
        type.select?.name === 'Widget' &&
        readRichTextPlain(page.properties.slug) === VENDING_WIDGET_SLUG
      )
    }) || null
  )
}

async function getLegacyVendingEnabled(): Promise<boolean> {
  const siteId = getBlogSiteIdOrNull()
  const supabase = getSupabaseAdmin()
  if (!siteId || !supabase) return DEFAULT_ENABLED

  const { data, error } = await supabase
    .from(TABLE)
    .select('vending_enabled')
    .eq('site_id', siteId)
    .maybeSingle()

  if (error || !data || data.vending_enabled == null) {
    return DEFAULT_ENABLED
  }

  return Boolean(data.vending_enabled)
}

async function syncLegacyVendingEnabled(enabled: boolean): Promise<void> {
  const supabase = getSupabaseAdmin()
  const siteId = getBlogSiteIdOrNull()
  if (!supabase || !siteId) return

  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from(TABLE)
    .update({ vending_enabled: enabled, updated_at: now })
    .eq('site_id', siteId)

  if (!updateError) return

  const { error: upsertError } = await supabase.from(TABLE).upsert(
    {
      site_id: siteId,
      theme_code: 'gallery',
      vending_enabled: enabled,
      updated_at: now,
    },
    { onConflict: 'site_id' }
  )
  if (upsertError) {
    console.warn('[vendingSettings] legacy sync failed:', upsertError.message)
  }
}

function resolveTitleKey(dbProps: PartialDatabaseObjectResponse['properties']) {
  if (dbProps.title?.type === 'title') return 'title'
  if (dbProps.Page?.type === 'title') return 'Page'
  return 'title'
}

function resolveStatusProperty(
  dbProps: PartialDatabaseObjectResponse['properties'],
  enabled: boolean
) {
  const name = enabled ? 'Published' : 'Hidden'
  const statusProp = dbProps.status
  if (statusProp?.type === 'status') {
    return { status: { name } }
  }
  return { select: { name } }
}

function buildVendingProperties(
  dbProps: PartialDatabaseObjectResponse['properties'],
  config: Pick<VendingConfig, 'enabled' | 'url' | 'title'>
) {
  const titleKey = resolveTitleKey(dbProps)
  const properties: any = {
    [titleKey]: {
      title: [{ text: { content: normalizeVendingTitle(config.title) } }],
    },
    slug: { rich_text: [{ text: { content: VENDING_WIDGET_SLUG } }] },
    excerpt: { rich_text: [{ text: { content: normalizeVendingUrl(config.url) } }] },
    type: { select: { name: 'Widget' } },
    status: resolveStatusProperty(dbProps, config.enabled),
  }
  return properties
}

export async function getVendingConfig(
  widgetPages?: PageObjectResponse[]
): Promise<VendingConfig> {
  try {
    const widget = await findVendingWidget(widgetPages)
    if (widget) return readVendingConfigFromPage(widget)
  } catch (error) {
    console.warn(
      '[vendingSettings] Notion vending widget lookup failed:',
      error instanceof Error ? error.message : error
    )
  }

  return {
    enabled: await getLegacyVendingEnabled(),
    url: DEFAULT_VENDING_URL,
    title: DEFAULT_VENDING_TITLE,
    id: null,
    source: 'legacy',
  }
}

export async function getVendingEnabled(): Promise<boolean> {
  const config = await getVendingConfig()
  return config.enabled
}

export async function updateVendingConfig(
  input: Partial<VendingConfig>
): Promise<VendingConfig> {
  const current = await getVendingConfig()
  const next = {
    enabled: input.enabled ?? current.enabled ?? DEFAULT_ENABLED,
    url: normalizeVendingUrl(input.url || current.url),
    title: normalizeVendingTitle(input.title || current.title),
  }

  if (!next.url.startsWith('http')) {
    throw new Error('贩售机地址必须以 http 开头')
  }

  const db = await getDatabaseMetadata()
  const existing = await findVendingWidget()
  const properties = buildVendingProperties(db.properties || {}, next)

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

  await syncLegacyVendingEnabled(next.enabled)
  const updated = await findVendingWidget()
  return updated
    ? readVendingConfigFromPage(updated)
    : { ...next, id: existing?.id ?? null, source: 'notion' }
}

export async function updateVendingEnabled(enabled: boolean): Promise<boolean> {
  const config = await updateVendingConfig({ enabled })
  return config.enabled
}
