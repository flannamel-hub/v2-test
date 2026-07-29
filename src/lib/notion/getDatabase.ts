import { ContentType } from '@/src/types/blog'
import { isFullDatabase, isFullPage } from '@notionhq/client'
import {
  DatabaseObjectResponse,
  GetDatabaseResponse,
  PageObjectResponse,
  PartialDatabaseObjectResponse,
  QueryDatabaseResponse,
  RichTextItemResponse,
} from '@notionhq/client/build/src/api-endpoints'
import { ApiFilter, ApiScope } from './../../types/notion'
import { filterSwitch } from './filter'
import { databaseId, notion } from './notion'
import {
  isNotionBuildPhase,
  isTransientNotionError,
  notionRetryCount,
  notionRetryDelayMs,
} from './transientErrors'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function withRetry<T>(fn: () => Promise<T>, retries = notionRetryCount()): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!isTransientNotionError(e) || i === retries - 1) throw e
      await sleep(notionRetryDelayMs(e, i))
    }
  }
  throw lastErr
}

// TODO: Refactor this to use the Utility functions `iteratePaginatedAPI` & `collectPaginatedAPI`  in @notionhq/client

export const getDatabase = async (
  scope?: ApiScope,
  cursor?: string,
  id?: string
): Promise<QueryDatabaseResponse> => {
  const filter = scope ? filterSwitch(scope) : undefined

  const response = await withRetry(() => notion.databases.query({
    database_id: id ?? databaseId,
    filter: filter,
    sorts: id
      ? [
          {
            timestamp: 'created_time',
            direction: 'ascending',
          },
        ]
      : [{ property: 'date', direction: 'descending' }],
    start_cursor: cursor,
  }))

  return response
}

type QuerySort =
  | { property: string; direction: 'ascending' | 'descending' }
  | { timestamp: 'created_time' | 'last_edited_time'; direction: 'ascending' | 'descending' }

/** 带自定义 filter 的分页查询（slug 单查等场景，避免拉全库） */
export const queryDatabasePages = async (
  filter: ApiFilter,
  options?: {
    sorts?: QuerySort[]
    pageSize?: number
    databaseId?: string
  }
): Promise<PageObjectResponse[]> => {
  const objects: PageObjectResponse[] = []
  let cursor: string | undefined
  const maxResults = options?.pageSize
  const targetDb = options?.databaseId ?? databaseId

  do {
    const response = await withRetry(() =>
      notion.databases.query({
        database_id: targetDb,
        filter,
        sorts: options?.sorts ?? [{ property: 'date', direction: 'descending' }],
        start_cursor: cursor,
        page_size: maxResults ? Math.min(maxResults, 100) : 100,
      })
    )
    addObjects(response.results, objects)
    cursor = response.next_cursor ?? undefined
    if (maxResults && objects.length >= maxResults) {
      return objects.slice(0, maxResults)
    }
  } while (cursor)

  return objects
}

const buildAllInflight = new Map<string, Promise<Array<PageObjectResponse>>>()

const getAllUncached = async (
  scope?: ApiScope,
  id?: string
): Promise<Array<PageObjectResponse>> => {
  const response = await getDatabase(scope, undefined, id)
  const objects: PageObjectResponse[] = []
  addObjects(response.results, objects)
  let cursor = response.next_cursor
  if (cursor) {
    do {
      const additional: QueryDatabaseResponse = await getDatabase(
        scope,
        cursor,
        id
      )
      addObjects(additional.results, objects)
      cursor = additional.next_cursor
    } while (cursor)
  }

  return objects
}

export const getAll = async (
  scope?: ApiScope,
  id?: string
): Promise<Array<PageObjectResponse>> => {
  if (!isNotionBuildPhase()) return getAllUncached(scope, id)

  const cacheKey = `${scope ?? 'all'}:${id ?? databaseId}`
  const existing = buildAllInflight.get(cacheKey)
  if (existing) return existing

  const request = getAllUncached(scope, id).catch((error) => {
    if (!isTransientNotionError(error)) throw error
    console.warn(
      `[getAll] Notion transient error during build, using empty data: ${cacheKey}`,
      error instanceof Error ? error.message : error
    )
    return []
  })
  buildAllInflight.set(cacheKey, request)
  return request
}

export const getDatabaseMetadata = async (): Promise<GetDatabaseResponse> => {
  return withRetry(() =>
    notion.databases.retrieve({ database_id: databaseId })
  )
}

const WIDGET_FILTER: ApiFilter = {
  and: [
    {
      property: 'type',
      select: { equals: 'Widget' },
    },
  ],
}

let buildWidgetPagesInflight: Promise<PageObjectResponse[]> | null = null

export const getWidgetPages = async (): Promise<PageObjectResponse[]> => {
  if (isNotionBuildPhase()) {
    if (!buildWidgetPagesInflight) {
      buildWidgetPagesInflight = queryDatabasePages(WIDGET_FILTER, {
        pageSize: 100,
      }).catch((error) => {
        if (!isTransientNotionError(error)) throw error
        console.warn(
          '[getWidgetPages] Notion transient error during build, using empty data:',
          error instanceof Error ? error.message : error
        )
        return []
      })
    }
    return buildWidgetPagesInflight
  }

  return queryDatabasePages(WIDGET_FILTER, { pageSize: 100 })
}

export const getDatabaseTitleAndIcon = async (): Promise<{
  title: RichTextItemResponse[]
  icon: DatabaseObjectResponse['icon']
}> => {
  const response = await getDatabaseMetadata()
  if (!isFullDatabase(response)) {
    throw new Error('Database response is not full')
  }
  return { title: response.title, icon: response.icon }
}

export const getDatabaseTitle = async (): Promise<
  Array<RichTextItemResponse>
> => {
  const response = await getDatabaseMetadata()
  if (!isFullDatabase(response)) {
    throw new Error('Database response is not full')
  }
  return response.title
}

export const getDatabaseIcon = async (): Promise<
  DatabaseObjectResponse['icon']
> => {
  const response = await getDatabaseMetadata()
  if (!isFullDatabase(response)) {
    throw new Error('Database response is not full')
  }
  return response.icon
}

export const getDatabaseProperties = async (): Promise<
  PartialDatabaseObjectResponse['properties']
> => {
  const response = await getDatabaseMetadata()
  return response.properties
}

function addObjects(
  results: QueryDatabaseResponse['results'],
  objects: PageObjectResponse[],
  filter?: ContentType
) {
  results.forEach((object) => {
    if (isFullPage(object)) {
      if (
        !filter ||
        (object.properties.type.type === 'select' &&
          object.properties.type.select?.name === filter)
      ) {
        objects.push(object)
      }
    }
  })
}
