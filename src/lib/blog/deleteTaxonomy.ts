import { Client } from '@notionhq/client'

export const FALLBACK_CATEGORY = '默认'

type NotionProps = Record<string, { type?: string; select?: { options?: { id: string; name: string; color?: string }[] }; multi_select?: { options?: { id: string; name: string; color?: string }[] } }>

export function resolveCategoryPropertyKey(properties: NotionProps): string | null {
  if (properties.category?.type === 'select') return 'category'
  if (properties.Category?.type === 'select') return 'Category'
  return null
}

export function resolveTagsPropertyKey(properties: NotionProps): string | null {
  if (properties.tags?.type === 'multi_select') return 'tags'
  if (properties.Tags?.type === 'multi_select') return 'Tags'
  return null
}

async function queryPagesWithFilter(
  notion: Client,
  databaseId: string,
  filter: Record<string, unknown>
) {
  const results: { id: string; properties: NotionProps }[] = []
  let cursor: string | undefined
  let hasMore = true
  while (hasMore) {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: filter as never,
      start_cursor: cursor,
      page_size: 100,
    })
    results.push(...(response.results as { id: string; properties: NotionProps }[]))
    hasMore = response.has_more
    cursor = response.next_cursor ?? undefined
  }
  return results
}

async function ensureSelectOption(
  notion: Client,
  databaseId: string,
  propertyKey: string,
  optionName: string
) {
  const db = await notion.databases.retrieve({ database_id: databaseId })
  const prop = db.properties[propertyKey]
  if (!prop || prop.type !== 'select') return false
  const options = prop.select?.options || []
  if (options.some((o) => o.name === optionName)) return true
  await notion.databases.update({
    database_id: databaseId,
    properties: {
      [propertyKey]: {
        select: {
          options: [
            ...options.map((o) => ({
              id: o.id,
              name: o.name,
              color: o.color || 'default',
            })),
            { name: optionName, color: 'gray' },
          ],
        },
      },
    },
  })
  return true
}

async function removeSelectSchemaOption(
  notion: Client,
  databaseId: string,
  propertyKey: string,
  optionName: string
) {
  const db = await notion.databases.retrieve({ database_id: databaseId })
  const prop = db.properties[propertyKey]
  if (!prop || prop.type !== 'select') return false
  const options = prop.select?.options || []
  const next = options.filter((o) => o.name !== optionName)
  if (next.length === options.length) return false
  await notion.databases.update({
    database_id: databaseId,
    properties: {
      [propertyKey]: {
        select: {
          options: next.map((o) => ({
            id: o.id,
            name: o.name,
            color: o.color || 'default',
          })),
        },
      },
    },
  })
  return true
}

async function removeMultiSelectSchemaOption(
  notion: Client,
  databaseId: string,
  propertyKey: string,
  optionName: string
) {
  const db = await notion.databases.retrieve({ database_id: databaseId })
  const prop = db.properties[propertyKey]
  if (!prop || prop.type !== 'multi_select') return false
  const options = prop.multi_select?.options || []
  const next = options.filter((o) => o.name !== optionName)
  if (next.length === options.length) return false
  await notion.databases.update({
    database_id: databaseId,
    properties: {
      [propertyKey]: {
        multi_select: {
          options: next.map((o) => ({
            id: o.id,
            name: o.name,
            color: o.color || 'default',
          })),
        },
      },
    },
  })
  return true
}

export async function deleteCategoryFromNotion(
  notion: Client,
  databaseId: string,
  name: string
) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new Error('分类名不能为空')

  const db = await notion.databases.retrieve({ database_id: databaseId })
  const categoryKey = resolveCategoryPropertyKey(db.properties as NotionProps)
  if (!categoryKey) throw new Error('未找到分类字段配置')

  const pages = await queryPagesWithFilter(notion, databaseId, {
    property: categoryKey,
    select: { equals: trimmed },
  })

  await ensureSelectOption(notion, databaseId, categoryKey, FALLBACK_CATEGORY)

  for (const page of pages) {
    await notion.pages.update({
      page_id: page.id,
      properties: {
        [categoryKey]: { select: { name: FALLBACK_CATEGORY } },
      },
    })
  }

  const removedFromSchema = await removeSelectSchemaOption(
    notion,
    databaseId,
    categoryKey,
    trimmed
  )

  return { updatedPosts: pages.length, removedFromSchema, fallbackCategory: FALLBACK_CATEGORY }
}

export async function deleteTagFromNotion(
  notion: Client,
  databaseId: string,
  name: string
) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new Error('标签名不能为空')

  const db = await notion.databases.retrieve({ database_id: databaseId })
  const tagsKey = resolveTagsPropertyKey(db.properties as NotionProps)
  if (!tagsKey) throw new Error('未找到标签字段配置')

  const pages = await queryPagesWithFilter(notion, databaseId, {
    property: tagsKey,
    multi_select: { contains: trimmed },
  })

  for (const page of pages) {
    const current =
      (page.properties[tagsKey] as { multi_select?: { name: string }[] })?.multi_select || []
    const next = current.filter((t) => t.name !== trimmed)
    await notion.pages.update({
      page_id: page.id,
      properties: {
        [tagsKey]: {
          multi_select: next.map((t) => ({ name: t.name })),
        },
      },
    })
  }

  const removedFromSchema = await removeMultiSelectSchemaOption(
    notion,
    databaseId,
    tagsKey,
    trimmed
  )

  return { updatedPosts: pages.length, removedFromSchema }
}

export async function renameCategoryFromNotion(
  notion: Client,
  databaseId: string,
  oldName: string,
  newName: string
) {
  const trimmedOld = (oldName || '').trim()
  const trimmedNew = (newName || '').trim()
  if (!trimmedOld || !trimmedNew) throw new Error('分类名不能为空')
  if (trimmedOld === trimmedNew) return { updatedPosts: 0, renamedFromSchema: false }

  const db = await notion.databases.retrieve({ database_id: databaseId })
  const categoryKey = resolveCategoryPropertyKey(db.properties as NotionProps)
  if (!categoryKey) throw new Error('未找到分类字段配置')

  const prop = db.properties[categoryKey]
  const options =
    prop?.type === 'select' ? prop.select?.options || [] : []
  if (options.some((o) => o.name === trimmedNew && o.name !== trimmedOld)) {
    throw new Error(`分类「${trimmedNew}」已存在`)
  }

  const pages = await queryPagesWithFilter(notion, databaseId, {
    property: categoryKey,
    select: { equals: trimmedOld },
  })

  for (const page of pages) {
    await notion.pages.update({
      page_id: page.id,
      properties: {
        [categoryKey]: { select: { name: trimmedNew } },
      },
    })
  }

  const oldOption = options.find((o) => o.name === trimmedOld)
  let renamedFromSchema = false
  if (oldOption) {
    const nextOptions = options.map((o) =>
      o.name === trimmedOld
        ? { id: o.id, name: trimmedNew, color: o.color || 'default' }
        : { id: o.id, name: o.name, color: o.color || 'default' }
    )
    await notion.databases.update({
      database_id: databaseId,
      properties: {
        [categoryKey]: {
          select: {
            options: nextOptions,
          },
        },
      },
    })
    renamedFromSchema = true
  }

  return { updatedPosts: pages.length, renamedFromSchema }
}
