import { ApiScope } from '@/src/types/notion'
import { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import {
  combineScopeWithSlugFilter,
  slugEqualsFilter,
} from './filter'
import {
  getSiteThemeCode,
  getSiteThemeConfigPageId,
} from '@/src/lib/blog/siteTheme'
import { getAll, getWidgetPages, queryDatabasePages } from './getDatabase'
import { notion } from './notion'
import { readRichTextPlain } from './readProperty'

const THEME_CONFIG_SLUG = 'theme-config'

/** 按需刷新期间强制每次从数据源读取主题（避免 Serverless 进程内旧缓存） */
let revalidateFreshTheme = false

export function setRevalidateFreshTheme(enabled: boolean): void {
  revalidateFreshTheme = enabled
}

export function isRevalidateFreshTheme(): boolean {
  return revalidateFreshTheme
}

let remoteThemeCached: string | null | undefined
let remoteThemeInflight: Promise<string | null> | null = null

function findThemeConfigPage(
  pages: PageObjectResponse[]
): PageObjectResponse | undefined {
  return pages.find(
    (page) => readRichTextPlain(page.properties['slug']) === THEME_CONFIG_SLUG
  )
}

function filterPagesByType(
  objects: PageObjectResponse[],
  typeName: string
): PageObjectResponse[] {
  return objects.filter(
    (object) =>
      object.properties['type'].type === 'select' &&
      object.properties['type'].select?.name === typeName
  )
}

function readThemeExcerptFromPage(page: PageObjectResponse): string | null {
  const excerpt = readRichTextPlain(page.properties['excerpt'])
  return excerpt || null
}

/** Notion 兜底：优先 pages.retrieve（强一致），再 slug filter */
async function fetchRemoteThemeFromNotion(): Promise<string | null> {
  const knownPageId = await getSiteThemeConfigPageId()
  if (knownPageId) {
    try {
      const page = (await notion.pages.retrieve({
        page_id: knownPageId,
      })) as PageObjectResponse
      const excerpt = readThemeExcerptFromPage(page)
      if (excerpt) return excerpt
    } catch (error) {
      console.warn('[fetchRemoteThemeFromNotion] pages.retrieve failed', error)
    }
  }

  try {
    const results = await queryDatabasePages(
      slugEqualsFilter(THEME_CONFIG_SLUG),
      { pageSize: 5 }
    )
    const page =
      results.find(
        (p) => readRichTextPlain(p.properties['slug']) === THEME_CONFIG_SLUG
      ) ?? results[0]
    if (page) {
      const excerpt = readThemeExcerptFromPage(page)
      if (excerpt) return excerpt
    }
  } catch (error) {
    console.warn('[fetchRemoteThemeFromNotion] slug query failed, scanning Home', error)
  }

  const objects = await getAll(ApiScope.Home)
  const themeConfigPage =
    findThemeConfigPage(filterPagesByType(objects, 'Widget')) ??
    findThemeConfigPage(objects)
  if (!themeConfigPage) return null
  return readThemeExcerptFromPage(themeConfigPage)
}

/**
 * 读取 Notion 中 slug=theme-config 页面的 excerpt（v1 / v2 / gallery 等原始代号）。
 * - next build：同一次构建内缓存一次（减少 Notion 调用）
 * - Vercel ISR：每次页面再生都读 Notion（温实例模块缓存不能跨主题切换复用）
 */
export const getRemoteTheme = async (): Promise<string | null> => {
  const persistAcrossCalls =
    process.env.NEXT_PHASE === 'phase-production-build' &&
    process.env.DISABLE_REMOTE_THEME_CACHE !== '1'

  if (persistAcrossCalls && remoteThemeCached !== undefined) {
    return remoteThemeCached
  }

  if (!remoteThemeInflight) {
    remoteThemeInflight = (async () => {
      const fromDb = await getSiteThemeCode()
      if (fromDb) return fromDb
      return fetchRemoteThemeFromNotion()
    })()
      .then((value) => {
        if (persistAcrossCalls) remoteThemeCached = value
        return value
      })
      .catch((e) => {
        console.error('获取远程主题配置失败:', e)
        if (persistAcrossCalls) remoteThemeCached = null
        return null
      })
      .finally(() => {
        remoteThemeInflight = null
      })
  }

  return remoteThemeInflight
}

/** 仅用于调试或测试；正常部署勿调用 */
export function clearRemoteThemeCache(): void {
  remoteThemeCached = undefined
  remoteThemeInflight = null
}

function isNotionContentType(
  object: PageObjectResponse,
  typeName: string
): boolean {
  return (
    object.properties['type'].type === 'select' &&
    object.properties['type'].select?.name === typeName
  )
}

function pickPostBySlugResults(
  results: PageObjectResponse[],
  _scope: ApiScope.Archive | ApiScope.Draft
): PageObjectResponse | null {
  const posts = results.filter((object) => isNotionContentType(object, 'Post'))
  if (posts.length > 0) return posts[0]
  return null
}

function findPostPageBySlugInList(
  objects: PageObjectResponse[],
  slug: string
): PageObjectResponse | undefined {
  const trimmed = slug.trim()
  return objects.find(
    (object) => readRichTextPlain(object.properties['slug']) === trimmed
  )
}

/** 仅检查 Notion 数据库查询索引是否已收录文章，不做全量扫描回退。 */
export async function isPostIndexedBySlug(
  slug: string,
  expectedId?: string | null
): Promise<boolean> {
  const trimmed = slug.trim()
  if (!trimmed) return false

  let results: PageObjectResponse[]
  try {
    results = await queryDatabasePages(
      combineScopeWithSlugFilter(ApiScope.Archive, trimmed),
      { pageSize: 5 }
    )
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code !== 'validation_error') throw error
    results = await queryDatabasePages(slugEqualsFilter(trimmed), { pageSize: 5 })
  }

  return results.some((object) => {
    if (!isNotionContentType(object, 'Post')) return false
    if (expectedId && object.id !== expectedId) return false
    if (readRichTextPlain(object.properties['slug']) !== trimmed) return false

    const status = object.properties['status']
    const statusName =
      status?.type === 'status'
        ? status.status?.name
        : status?.type === 'select'
          ? status.select?.name
          : null
    return statusName === 'Published'
  })
}

/** 按 slug 查单篇（Archive / Draft）；Notion filter 未命中时回退内存匹配 */
export async function getPostBySlug(
  slug: string,
  scope: ApiScope.Archive | ApiScope.Draft
): Promise<PageObjectResponse | null> {
  const trimmed = slug.trim()
  if (!trimmed) return null

  const filter = combineScopeWithSlugFilter(scope, trimmed)
  let results: PageObjectResponse[] = []
  try {
    results = await queryDatabasePages(filter, { pageSize: 5 })
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code !== 'validation_error') throw error
    console.warn(
      `[getPostBySlug] Notion filter rejected, falling back to scan: ${trimmed}`,
      error
    )
  }
  const picked = pickPostBySlugResults(results, scope)
  if (picked) return picked

  const objects = await getAll(scope)
  const fallback = findPostPageBySlugInList(objects, trimmed)
  if (!fallback) {
    console.warn(
      `[getPostBySlug] slug filter miss, not found in scope ${scope}: ${trimmed}`
    )
    return null
  }
  return pickPostBySlugResults([fallback], scope)
}

export const getPageBySlug = async (slug: string) => {
  const filter = combineScopeWithSlugFilter(ApiScope.Page, slug)
  const results = await queryDatabasePages(filter, { pageSize: 1 })
  const page =
    results.find((object) => isNotionContentType(object, 'Page')) ?? null
  return page ?? (null as unknown as PageObjectResponse)
}

export const getPages = async () => {
  const objects = await getAll(ApiScope.Page)
  return objects.filter(
    (object) =>
      object.properties['type'].type === 'select' &&
      object.properties['type'].select?.name === 'Page'
  )
}

export const getPosts = async (
  scope: ApiScope.Home | ApiScope.Archive | ApiScope.Draft
) => {
  const objects = await getAll(scope)
  return objects.filter(
    (object) =>
      object.properties['type'].type === 'select' &&
      object.properties['type'].select?.name === 'Post'
  )
}

export const getPostsAndPieces = async (
  scope: ApiScope.Home | ApiScope.Archive | ApiScope.Draft
) => {
  const objects = await getAll(scope)
  return {
    posts: objects.filter(
      (object) =>
        object.properties['type'].type === 'select' &&
        object.properties['type'].select?.name === 'Post'
    ),
    pieces: objects.filter(
      (object) =>
        object.properties['type'].type === 'select' &&
        object.properties['type'].select?.name === 'Piece'
    ),
  }
}

export const getWidgets = async (widgetPages?: PageObjectResponse[]) => {
  const objects = widgetPages ?? (await getWidgetPages())
  return objects.filter(
    (object) =>
      object.properties['type'].type === 'select' &&
      object.properties['type'].select?.name === 'Widget' &&
      ((object.properties['status'].type === 'status' &&
        object.properties['status'].status?.name === 'Published') ||
        (object.properties['status'].type === 'select' &&
          object.properties['status'].select?.name === 'Published'))
  )
}
