import { Client } from '@notionhq/client'

const notion = new Client({
  auth: process.env.NOTION_KEY || process.env.NOTION_TOKEN,
})

const MAIN_DB = process.env.NOTION_PAGE_ID || process.env.NOTION_DATABASE_ID
const FRIENDS_SLUG = 'friends'
const FRIENDS_DATABASE_TITLE = 'Friends'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isTransient = (e) => {
  const msg = String((e && e.message) || '')
  const code = String((e && e.code) || '')
  return (
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket hang up|network|fetch failed|aborted/i.test(
      msg
    ) ||
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

function readRichText(prop) {
  if (!prop || prop.type !== 'rich_text') return ''
  return (prop.rich_text || []).map((t) => t.plain_text).join('').trim()
}

function readStatusName(prop) {
  if (!prop) return 'Published'
  if (prop.type === 'status') return prop.status?.name || 'Published'
  if (prop.type === 'select') return prop.select?.name || 'Published'
  return 'Published'
}

function readAvatar(prop) {
  const files = prop?.type === 'files' ? prop.files || [] : []
  const file = files[0]
  if (!file) return ''
  return file.external?.url || file.file?.url || ''
}

function pickProp(props, preferred, type) {
  if (props[preferred]?.type === type) return preferred
  for (const [name, def] of Object.entries(props)) {
    if (def.type === type) return name
  }
  return null
}

function pickStatusProp(props) {
  if (props.status?.type === 'status' || props.status?.type === 'select') {
    return 'status'
  }
  for (const [name, def] of Object.entries(props)) {
    if (def.type === 'status' || def.type === 'select') return name
  }
  return null
}

async function findFriendsPage() {
  let cursor
  do {
    const q = await withRetry(() =>
      notion.databases.query({ database_id: MAIN_DB, start_cursor: cursor })
    )
    for (const row of q.results) {
      const props = row.properties || {}
      const slugProp = props.slug || props.Slug
      const slug = slugProp?.rich_text?.[0]?.plain_text || ''
      if (slug === FRIENDS_SLUG) return row
    }
    cursor = q.has_more ? q.next_cursor : undefined
  } while (cursor)
  return null
}

async function findFriendsChildDatabase(pageId) {
  let childDbId = null
  let firstAnyDb = null
  let cursor
  do {
    const c = await withRetry(() =>
      notion.blocks.children.list({ block_id: pageId, start_cursor: cursor })
    )
    for (const block of c.results) {
      if (block.type !== 'child_database') continue
      if (!firstAnyDb) firstAnyDb = block.id
      if (block.child_database?.title === FRIENDS_DATABASE_TITLE) {
        childDbId = block.id
        break
      }
    }
    cursor = !childDbId && c.has_more ? c.next_cursor : undefined
  } while (cursor)
  return childDbId || firstAnyDb
}

export function clearFriendsDbCache() {
  cache = null
}

export async function discoverFriendsDb() {
  if (cache) return cache
  if (!MAIN_DB) throw new Error('文章数据服务尚未配置，请联系管理')

  const friendPage = await findFriendsPage()
  if (!friendPage) throw new Error('主库中未找到 slug=friends 的页面')

  const childDbId = await findFriendsChildDatabase(friendPage.id)
  if (!childDbId) throw new Error('friends 页面内部未找到友链子数据库')

  const db = await withRetry(() =>
    notion.databases.retrieve({ database_id: childDbId })
  )
  const props = db.properties || {}
  const titleProp = pickProp(props, 'name', 'title')
  const urlProp = pickProp(props, 'url', 'url')
  const avatarProp = pickProp(props, 'avatar', 'files')
  const descriptionProp = pickProp(props, 'description', 'rich_text')
  const statusProp = pickStatusProp(props)

  if (!titleProp) throw new Error('友链子数据库缺少 title 类型的 name 字段')
  if (!urlProp) throw new Error('友链子数据库缺少 url 类型的 url 字段')
  if (!avatarProp) throw new Error('友链子数据库缺少 files 类型的 avatar 字段')

  cache = {
    dbId: childDbId,
    titleProp,
    urlProp,
    avatarProp,
    descriptionProp,
    statusProp,
    statusType: statusProp ? props[statusProp]?.type : null,
  }
  return cache
}

export function mapFriend(page, c) {
  const props = page.properties || {}
  const name = c.titleProp ? props[c.titleProp]?.title?.[0]?.plain_text || '' : ''
  const url = c.urlProp ? props[c.urlProp]?.url || '' : ''
  const avatar = c.avatarProp ? readAvatar(props[c.avatarProp]) : ''
  const description = c.descriptionProp ? readRichText(props[c.descriptionProp]) : ''
  const status = c.statusProp ? readStatusName(props[c.statusProp]) : 'Published'
  return { id: page.id, name, url, avatar, description, status }
}

function normalizeStatus(status) {
  return (status || '').trim() || 'Published'
}

export function buildFriendProperties(c, input) {
  const properties = {}
  const name = (input.name || '').trim()
  const url = (input.url || '').trim()
  const avatar = (input.avatar || '').trim()
  const description = (input.description || '').trim()
  const status = normalizeStatus(input.status)

  if (c.titleProp) properties[c.titleProp] = { title: [{ text: { content: name } }] }
  if (c.urlProp) properties[c.urlProp] = { url: url || null }
  if (c.avatarProp) {
    properties[c.avatarProp] = {
      files: avatar
        ? [{ type: 'external', name: 'avatar', external: { url: avatar } }]
        : [],
    }
  }
  if (c.descriptionProp) {
    properties[c.descriptionProp] = {
      rich_text: description ? [{ text: { content: description } }] : [],
    }
  }
  if (c.statusProp) {
    properties[c.statusProp] =
      c.statusType === 'select'
        ? { select: { name: status } }
        : { status: { name: status } }
  }

  return properties
}

export async function listFriends() {
  const c = await discoverFriendsDb()
  let results = []
  let cursor
  do {
    const r = await withRetry(() =>
      notion.databases.query({ database_id: c.dbId, start_cursor: cursor })
    )
    results = results.concat(r.results)
    cursor = r.has_more ? r.next_cursor : undefined
  } while (cursor)
  return { config: c, friends: results.map((p) => mapFriend(p, c)) }
}

export async function findFriendByUrl(c, url) {
  if (!url) return null
  const response = await withRetry(() =>
    notion.databases.query({
      database_id: c.dbId,
      filter: { property: c.urlProp, url: { equals: url } },
      page_size: 1,
    })
  )
  return response.results[0] || null
}

export async function upsertFriend(input, options = {}) {
  const c = await discoverFriendsDb()
  const name = (input.name || '').trim()
  const url = (input.url || '').trim()
  if (!name) throw new Error('友链名称不能为空')
  if (!url) throw new Error('友链地址不能为空')

  const existing = options.id
    ? { id: options.id }
    : options.upsert
      ? await findFriendByUrl(c, url)
      : null
  const properties = buildFriendProperties(c, {
    ...input,
    name,
    url,
    status: input.status || 'Published',
  })

  if (existing) {
    await withRetry(() =>
      notion.pages.update({ page_id: existing.id, properties })
    )
    return { success: true, action: 'updated', id: existing.id, url }
  }

  const created = await withRetry(() =>
    notion.pages.create({ parent: { database_id: c.dbId }, properties })
  )
  return { success: true, action: 'created', id: created.id, url }
}

export async function hideFriendByUrl(url) {
  const c = await discoverFriendsDb()
  if (!c.statusProp) throw new Error('友链子数据库缺少 status 字段，无法隐藏友链')
  const normalizedUrl = (url || '').trim()
  if (!normalizedUrl) throw new Error('缺少 url')
  const existing = await findFriendByUrl(c, normalizedUrl)
  if (!existing) throw new Error('未找到该 url 对应的友链')

  const properties = {
    [c.statusProp]:
      c.statusType === 'select'
        ? { select: { name: 'Hidden' } }
        : { status: { name: 'Hidden' } },
  }
  await withRetry(() =>
    notion.pages.update({ page_id: existing.id, properties })
  )
  return { success: true, action: 'hidden', id: existing.id, url: normalizedUrl }
}

export async function deleteFriendById(id) {
  if (!id) throw new Error('缺少 id')
  await withRetry(() => notion.pages.update({ page_id: id, archived: true }))
  return { success: true }
}
