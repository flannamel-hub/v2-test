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

/** VENDING_MODE:blog_site_settings 新列读取结果（023 未执行/无行/读取失败 → null 降级） */
type VendingSettingsColumns = {
  mode: 'official' | 'custom'
  rawMode: string | null
  officialTitle: string | null
  officialUrl: string | null
  customTitle: string | null
  customUrl: string | null
}

async function readVendingSettingsColumns(): Promise<VendingSettingsColumns | null> {
  const siteId = getBlogSiteIdOrNull()
  const supabase = getSupabaseAdmin()
  if (!siteId || !supabase) return null

  const { data, error } = await supabase
    .from(TABLE)
    .select(
      'vending_mode, vending_official_title, vending_official_url, vending_custom_title, vending_custom_url'
    )
    .eq('site_id', siteId)
    .maybeSingle()

  if (error || !data) return null
  const rawMode = typeof data.vending_mode === 'string' ? data.vending_mode.trim() : ''
  return {
    // null/未知一律按 'official' 处理
    mode: rawMode === 'custom' ? 'custom' : 'official',
    rawMode: rawMode || null,
    officialTitle: data.vending_official_title || null,
    officialUrl: data.vending_official_url || null,
    customTitle: data.vending_custom_title || null,
    customUrl: data.vending_custom_url || null,
  }
}

/** VENDING_MODE:写 settings 新列（update→无行 upsert；失败 console.warn 不阻断，Q3） */
async function writeVendingSettingsColumns(
  values: Partial<{
    vending_mode: string
    vending_official_title: string
    vending_official_url: string
    vending_custom_title: string
    vending_custom_url: string
  }>
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const siteId = getBlogSiteIdOrNull()
  if (!supabase || !siteId) return

  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from(TABLE)
    .update({ ...values, updated_at: now })
    .eq('site_id', siteId)
  if (!updateError) return

  const { error: upsertError } = await supabase.from(TABLE).upsert(
    {
      site_id: siteId,
      theme_code: 'gallery',
      ...values,
      updated_at: now,
    },
    { onConflict: 'site_id' }
  )
  if (upsertError) {
    console.warn('[vendingSettings] vending mode columns sync failed:', upsertError.message)
  }
}

/** widget 写入（含 P11-C5 串行化 + 临界区内查重转 update） */
async function writeVendingWidget(
  config: Pick<VendingConfig, 'enabled' | 'url' | 'title'>
): Promise<void> {
  const db = await getDatabaseMetadata()
  const properties = buildVendingProperties(db.properties || {}, config)

  const release = await acquireUpdateTurn()
  try {
    // P11-C5: 查重在串行临界区内进行——并发双击时后到请求能查到先建页，转 update 不再 create
    const existing = await findVendingWidget()
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
}

export type VendingAdminState = {
  enabled: boolean
  title: string
  url: string
  mode: 'official' | 'custom'
  officialTitle: string | null
  officialUrl: string | null
  customTitle: string | null
  customUrl: string | null
  id: string | null
  source: 'notion' | 'legacy' | 'default'
}

/** VENDING_MODE:后台/API 完整状态（widget 现值 + settings 新列快照） */
export async function getVendingAdminState(): Promise<VendingAdminState> {
  const [config, columns] = await Promise.all([
    getVendingConfig(),
    readVendingSettingsColumns(),
  ])
  return {
    enabled: config.enabled,
    title: config.title,
    url: config.url,
    mode: columns?.mode ?? 'official',
    officialTitle: columns?.officialTitle ?? null,
    officialUrl: columns?.officialUrl ?? null,
    customTitle: columns?.customTitle ?? null,
    customUrl: columns?.customUrl ?? null,
    id: config.id ?? null,
    source: config.source ?? 'default',
  }
}

/** VENDING_MODE:商户后台保存（登录商户调用；无密码路径）
 * - 无 mode：enabled-only，仅翻 widget status，title/url/mode 不动（Q1=现状行为）
 * - mode='official'：widget := official_* ?? DEFAULT_*，mode='official'，status=Published
 * - mode='custom'：校验 title(≤40)/url(http)，widget := 提交值，custom_* := 提交值，mode='custom'，status=Published
 * - Q3 写入顺序：先写 settings 列、后写 widget；Q2 三路径均沿用 syncLegacyVendingEnabled */
export async function applyMerchantVendingUpdate(input: {
  enabled?: boolean
  mode?: 'official' | 'custom'
  title?: string
  url?: string
}): Promise<VendingAdminState> {
  const columns = await readVendingSettingsColumns()

  if (!input.mode) {
    // Q1: enabled-only —— 仅翻 widget status（title/url 以现值回写=不动，mode 不变）
    const current = await getVendingConfig()
    const nextEnabled = input.enabled ?? current.enabled
    await writeVendingWidget({
      enabled: nextEnabled,
      title: current.title,
      url: current.url,
    })
    await syncLegacyVendingEnabled(nextEnabled)
    return getVendingAdminState()
  }

  if (input.mode === 'official') {
    // Q4: official_* 为空（过渡窗口）→ 回退 DEFAULT_*
    const officialTitle = columns?.officialTitle || DEFAULT_VENDING_TITLE
    const officialUrl = columns?.officialUrl || DEFAULT_VENDING_URL
    await writeVendingSettingsColumns({ vending_mode: 'official' })
    await writeVendingWidget({ enabled: true, title: officialTitle, url: officialUrl })
    await syncLegacyVendingEnabled(true)
    return getVendingAdminState()
  }

  // mode === 'custom'
  const customTitle = normalizeVendingTitle(input.title)
  if (customTitle.length > 40) {
    throw new Error('按钮名称最多 40 字')
  }
  const customUrl = (input.url || '').trim()
  if (!customUrl.startsWith('http')) {
    throw new Error('贩售机地址必须以 http 开头')
  }
  await writeVendingSettingsColumns({
    vending_mode: 'custom',
    vending_custom_title: customTitle,
    vending_custom_url: customUrl,
  })
  await writeVendingWidget({ enabled: true, title: customTitle, url: customUrl })
  await syncLegacyVendingEnabled(true)
  return getVendingAdminState()
}

/** VENDING_MODE:平台同步（维护密码鉴权调用）
 * - official_* := 提交的 title/url（仅更新提供了的字段）
 * - mode!=='custom'：与现状一致全量写 widget（title/url/enabled）
 * - mode==='custom'：跳过 widget 写入（保持商户自定义，enabled 也不动）
 * - Q2 平台路径同样沿用 syncLegacyVendingEnabled；返回最新完整配置 */
export async function applyPlatformVendingSync(input: {
  enabled?: boolean
  title?: string
  url?: string
}): Promise<VendingAdminState> {
  const columns = await readVendingSettingsColumns()
  const nextTitle =
    typeof input.title === 'string' && input.title.trim() !== ''
      ? input.title.trim()
      : null
  const nextUrl =
    typeof input.url === 'string' && input.url.trim() !== ''
      ? input.url.trim()
      : null

  const officialPatch: Record<string, string> = {}
  if (nextTitle !== null) officialPatch.vending_official_title = nextTitle
  if (nextUrl !== null) officialPatch.vending_official_url = nextUrl
  if (Object.keys(officialPatch).length > 0) {
    await writeVendingSettingsColumns(officialPatch)
  }

  if (columns?.mode !== 'custom') {
    const current = await getVendingConfig()
    const nextEnabled = input.enabled ?? current.enabled
    await writeVendingWidget({
      enabled: nextEnabled,
      title: nextTitle ?? current.title,
      url: nextUrl ?? current.url,
    })
    await syncLegacyVendingEnabled(nextEnabled)
  } else {
    // 自定义站：跳过 widget 写入（enabled 也不动），legacy 按当前 widget 状态对齐
    const current = await getVendingConfig()
    await syncLegacyVendingEnabled(current.enabled)
  }
  return getVendingAdminState()
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

  await writeVendingWidget(next)

  await syncLegacyVendingEnabled(next.enabled)
  const updated = await findVendingWidget()
  return updated
    ? readVendingConfigFromPage(updated)
    : { ...next, id: null, source: 'notion' }
}

export async function updateVendingEnabled(enabled: boolean): Promise<boolean> {
  const config = await updateVendingConfig({ enabled })
  return config.enabled
}
