import { Client } from '@notionhq/client'
import { getDatabaseMetadata, queryDatabasePages } from '@/src/lib/notion/getDatabase'
import { databaseId } from '@/src/lib/notion/notion'
import { slugEqualsFilter } from '@/src/lib/notion/filter'

const notion = new Client({
  auth: process.env.NOTION_KEY || process.env.NOTION_TOKEN,
})

const SOCIAL_WIDGET_SLUG = 'social-links'
const SOCIAL_DATABASE_TITLES = ['SocialLinks', 'Social Links', 'social-links', '社交媒体']
const SOCIAL_PLATFORMS = [
  { platform: 'weibo', name: '微博' },
  { platform: 'twitter', name: 'Twitter' },
  { platform: 'pixiv', name: 'Pixiv' },
  { platform: 'telegram', name: 'Telegram' },
  { platform: 'instagram', name: 'Instagram' },
]

const PLATFORM_ALIASES = {
  weibo: 'weibo',
  '微博': 'weibo',
  twitter: 'twitter',
  x: 'twitter',
  '推特': 'twitter',
  pixiv: 'pixiv',
  'p站': 'pixiv',
  telegram: 'telegram',
  tg: 'telegram',
  instagram: 'instagram',
  ins: 'instagram',
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isTransient = (e) => {
  const msg = String((e && e.message) || '')
  const code = String((e && e.code) || '')
  return (
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket hang up|network|fetch failed|aborted/i.test(msg) ||
    /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|ENOTFOUND/i.test(code) ||
    (e && (e.status === 429 || e.status === 502 || e.status === 503 || e.status === 504))
  )
}

async function withRetry(fn, retries = 4) {
  let lastErr
  for (let i = 0; i < retries; i += 1) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!isTransient(e) || i === retries - 1) throw e
      await sleep(500 * Math.pow(2, i))
    }
  }
  throw lastErr
}

let cache = null

function readText(prop) {
  if (!prop) return ''
  if (prop.type === 'title') return (prop.title || []).map((t) => t.plain_text).join('').trim()
  if (prop.type === 'rich_text') return (prop.rich_text || []).map((t) => t.plain_text).join('').trim()
  if (prop.type === 'url') return prop.url || ''
  if (prop.type === 'select') return prop.select?.name || ''
  if (prop.type === 'status') return prop.status?.name || ''
  return ''
}

function readStatus(prop) {
  const value = readText(prop)
  return value || 'Published'
}

function normalizePlatform(value) {
  const text = String(value || '').trim()
  const key = text.toLowerCase()
  return PLATFORM_ALIASES[key] || PLATFORM_ALIASES[text] || key
}

function normalizeStatus(status, url) {
  const value = String(status || '').trim()
  if (value) return value
  return String(url || '').trim() ? 'Published' : 'Hidden'
}

function pickProp(props, preferred, type) {
  if (props[preferred]?.type === type) return preferred
  for (const [name, def] of Object.entries(props)) {
    if (def.type === type) return name
  }
  return null
}

function pickAnyProp(props, preferred, types) {
  if (types.includes(props[preferred]?.type)) return preferred
  for (const [name, def] of Object.entries(props)) {
    if (types.includes(def.type)) return name
  }
  return null
}

function pickStatusProp(props) {
  return pickAnyProp(props, 'status', ['status', 'select'])
}

async function findSocialLinksWidget() {
  const pages = await queryDatabasePages(slugEqualsFilter(SOCIAL_WIDGET_SLUG), {
    pageSize: 8,
  })
  return (
    pages.find((page) => {
      const type = page.properties?.type
      return type?.type === 'select' && type.select?.name === 'Widget'
    }) || null
  )
}

async function findSocialLinksChildDatabase(pageId) {
  let firstAnyDb = null
  let cursor
  do {
    const c = await withRetry(() =>
      notion.blocks.children.list({ block_id: pageId, start_cursor: cursor })
    )
    for (const block of c.results) {
      if (block.type !== 'child_database') continue
      if (!firstAnyDb) firstAnyDb = block.id
      if (SOCIAL_DATABASE_TITLES.includes(block.child_database?.title || '')) {
        return block.id
      }
    }
    cursor = c.has_more ? c.next_cursor : undefined
  } while (cursor)
  return firstAnyDb
}

export function clearSocialLinksDbCache() {
  cache = null
}

async function createSocialLinksWidget() {
  const db = await getDatabaseMetadata()
  const props = db.properties || {}
  const titleKey =
    props.title?.type === 'title'
      ? 'title'
      : props.Page?.type === 'title'
        ? 'Page'
        : null
  if (!titleKey) throw new Error('主库缺少 title 字段')
  const statusType = props.status?.type === 'status' ? 'status' : 'select'
  if (!databaseId) throw new Error('文章数据服务尚未配置，请联系管理')
  const page = await withRetry(() =>
    notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        [titleKey]: { title: [{ text: { content: '社交媒体' } }] },
        slug: { rich_text: [{ text: { content: SOCIAL_WIDGET_SLUG } }] },
        type: { select: { name: 'Widget' } },
        status:
          statusType === 'status'
            ? { status: { name: 'Published' } }
            : { select: { name: 'Published' } },
      },
    })
  )
  return page
}

async function createSocialLinksChildDatabase(widgetId) {
  const resp = await withRetry(() =>
    notion.blocks.children.append({
      block_id: widgetId,
      children: [
        { type: 'child_database', child_database: { title: 'SocialLinks' } },
      ],
    })
  )
  const childDbId = resp.results.find((b) => b.type === 'child_database')?.id
  if (!childDbId) throw new Error('创建社交媒体子数据库失败')
  await withRetry(() =>
    notion.databases.update({
      database_id: childDbId,
      properties: {
        platform: {
          select: {
            options: [
              { name: 'weibo' },
              { name: 'twitter' },
              { name: 'pixiv' },
              { name: 'telegram' },
              { name: 'instagram' },
            ],
          },
        },
        url: { url: {} },
        status: {
          select: { options: [{ name: 'Published' }, { name: 'Hidden' }] },
        },
      },
    })
  )
  return childDbId
}

async function ensureSocialLinksInfrastructure() {
  let widget = await findSocialLinksWidget()
  let created = false
  if (!widget) {
    widget = await createSocialLinksWidget()
    created = true
  }
  let childDbId = await findSocialLinksChildDatabase(widget.id)
  if (!childDbId) {
    childDbId = await createSocialLinksChildDatabase(widget.id)
    created = true
  }
  if (created) clearSocialLinksDbCache()
  return { widget, childDbId }
}

export async function discoverSocialLinksDb() {
  if (cache) return cache

  const { widget, childDbId } = await ensureSocialLinksInfrastructure()

  const db = await withRetry(() => notion.databases.retrieve({ database_id: childDbId }))
  const props = db.properties || {}
  const titleProp = pickProp(props, 'name', 'title')
  const platformProp = pickAnyProp(props, 'platform', ['select', 'rich_text', 'title'])
  const urlProp = pickAnyProp(props, 'url', ['url', 'rich_text', 'title'])
  const statusProp = pickStatusProp(props)

  if (!titleProp) throw new Error('社交媒体子数据库缺少 title 类型的 name 字段')
  if (!platformProp) throw new Error('社交媒体子数据库缺少 platform 字段')
  if (!urlProp) throw new Error('社交媒体子数据库缺少 url 字段')
  if (!statusProp) throw new Error('社交媒体子数据库缺少 status 字段')

  cache = {
    widgetId: widget.id,
    enabled: readStatus(widget.properties?.status) === 'Published',
    widgetStatusType: widget.properties?.status?.type,
    dbId: childDbId,
    titleProp,
    platformProp,
    platformType: props[platformProp]?.type,
    urlProp,
    urlType: props[urlProp]?.type,
    statusProp,
    statusType: props[statusProp]?.type,
  }
  return cache
}

function mapSocialLink(page, c) {
  const props = page.properties || {}
  const platform = normalizePlatform(readText(props[c.platformProp]) || readText(props[c.titleProp]))
  return {
    id: page.id,
    name: readText(props[c.titleProp]),
    platform,
    url: readText(props[c.urlProp]),
    status: readStatus(props[c.statusProp]),
  }
}

function buildProperties(c, input) {
  const platform = normalizePlatform(input.platform)
  const meta = SOCIAL_PLATFORMS.find((item) => item.platform === platform)
  const name = String(input.name || meta?.name || platform).trim()
  const url = String(input.url || '').trim()
  const status = normalizeStatus(input.status, url)
  const properties = {
    [c.titleProp]: { title: [{ text: { content: name } }] },
  }

  if (c.platformType === 'select') {
    properties[c.platformProp] = { select: { name: platform } }
  } else if (c.platformType === 'title') {
    properties[c.platformProp] = { title: [{ text: { content: platform } }] }
  } else {
    properties[c.platformProp] = { rich_text: [{ text: { content: platform } }] }
  }

  if (c.urlType === 'url') {
    properties[c.urlProp] = { url: url || null }
  } else if (c.urlType === 'title') {
    properties[c.urlProp] = url ? { title: [{ text: { content: url } }] } : { title: [] }
  } else {
    properties[c.urlProp] = url ? { rich_text: [{ text: { content: url } }] } : { rich_text: [] }
  }

  properties[c.statusProp] =
    c.statusType === 'status'
      ? { status: { name: status } }
      : { select: { name: status } }

  return properties
}

async function queryAllLinks(c) {
  let results = []
  let cursor
  do {
    const r = await withRetry(() =>
      notion.databases.query({ database_id: c.dbId, start_cursor: cursor })
    )
    results = results.concat(r.results)
    cursor = r.has_more ? r.next_cursor : undefined
  } while (cursor)
  return results.map((page) => mapSocialLink(page, c))
}

function fillFixedPlatforms(links) {
  return SOCIAL_PLATFORMS.map((meta) => {
    const item = links.find((link) => normalizePlatform(link.platform) === meta.platform)
    return {
      id: item?.id || null,
      name: item?.name || meta.name,
      platform: meta.platform,
      url: item?.url || '',
      status: item?.status || 'Hidden',
    }
  })
}

export async function listSocialLinks() {
  const c = await discoverSocialLinksDb()
  const links = await queryAllLinks(c)
  return {
    enabled: c.enabled,
    links: fillFixedPlatforms(links),
  }
}

export async function saveSocialLinks(input = {}) {
  const c = await discoverSocialLinksDb()
  const enabled =
    typeof input.enabled === 'boolean' ? input.enabled : c.enabled
  await withRetry(() =>
    notion.pages.update({
      page_id: c.widgetId,
      properties: {
        status: c.widgetStatusType === 'status'
          ? { status: { name: enabled ? 'Published' : 'Hidden' } }
          : { select: { name: enabled ? 'Published' : 'Hidden' } },
      },
    })
  )

  const currentLinks = await queryAllLinks(c)
  const currentByPlatform = new Map(
    currentLinks.map((link) => [normalizePlatform(link.platform), link])
  )
  const inputByPlatform = new Map(
    (input.links || [])
      .map((link) => ({ ...link, platform: normalizePlatform(link.platform) }))
      .filter((link) => SOCIAL_PLATFORMS.some((meta) => meta.platform === link.platform))
      .map((link) => [link.platform, link])
  )

  for (const meta of SOCIAL_PLATFORMS) {
    const next = inputByPlatform.get(meta.platform) || {
      platform: meta.platform,
      name: meta.name,
      url: '',
      status: 'Hidden',
    }
    const properties = buildProperties(c, {
      ...next,
      name: next.name || meta.name,
      platform: meta.platform,
    })
    const existing = currentByPlatform.get(meta.platform)
    if (existing?.id) {
      await withRetry(() => notion.pages.update({ page_id: existing.id, properties }))
    } else {
      await withRetry(() =>
        notion.pages.create({ parent: { database_id: c.dbId }, properties })
      )
    }
  }

  clearSocialLinksDbCache()
  return listSocialLinks()
}
