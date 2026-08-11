import { CachedNav, Page, Title } from '@/src/types/blog'
import { DatabaseObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { formatPages } from '../blog/format/page'
import { getPages } from './getBlogData'
import { joinRichTextPlain } from './readProperty'
import { getDatabaseTitleAndIcon } from './getDatabase'
import { isTransientNotionError, isNotionBuildPhase } from './transientErrors'
import { getImageHostConfig } from '@/src/lib/media/imageHostConfig'
import { rewriteManagedAssetUrl } from '@/src/lib/media/rewriteManagedAssetUrl'

const cache = new Map<string, CachedNav>()

/** 构建期合并并发 nav 请求，避免 11 个 SSG 页面同时打 Notion */
let buildNavInflight: Promise<{
  navPages: Page[]
  siteTitle: Title
  logo: DatabaseObjectResponse['icon']
}> | null = null

function buildFallbackNav(cacheTimeInSeconds: number): CachedNav {
  return {
    navPages: [],
    siteTitle: {
      text: 'PRO BLOG',
      color: 'gray',
      slug: '/',
    },
    logo: null,
    ttl: Date.now() + cacheTimeInSeconds * 1000,
  }
}

function packNavResult(entry: CachedNav) {
  return {
    navPages: entry.navPages,
    siteTitle: entry.siteTitle,
    logo: entry.logo ?? null,
  }
}

async function fetchNavFromNotion(cacheTimeInSeconds: number) {
  const imageHostConfig = await getImageHostConfig()
  const pages = await getPages()
  const formattedPages = formatPages(pages)

  let databaseTitle: Awaited<
    ReturnType<typeof getDatabaseTitleAndIcon>
  >['title'] = []
  let databaseIcon: DatabaseObjectResponse['icon'] = null

  try {
    const metadata = await getDatabaseTitleAndIcon()
    databaseTitle = metadata.title
    databaseIcon = metadata.icon
  } catch (metaError) {
    if (!isTransientNotionError(metaError) || !isNotionBuildPhase()) {
      throw metaError
    }
    console.warn(
      '[getCachedNavFooter] metadata transient error, using defaults:',
      metaError instanceof Error ? metaError.message : metaError
    )
  }

  const titleText = joinRichTextPlain(databaseTitle, {
    splitRunsWithSpace: true,
  }).trim()
  const title: Title = {
    text: titleText || 'PRO BLOG',
    color: databaseTitle[0]?.annotations?.color ?? 'gray',
    slug: '/',
  }

  const cachedNav: CachedNav = {
    navPages: formattedPages,
    siteTitle: title,
    logo:
      databaseIcon?.type === 'external'
        ? {
            ...databaseIcon,
            external: {
              ...databaseIcon.external,
              url: rewriteManagedAssetUrl(
                databaseIcon.external.url,
                imageHostConfig
              ),
            },
          }
        : databaseIcon,
    ttl: Date.now() + cacheTimeInSeconds * 1000,
  }

  cache.set('nav', cachedNav)
  return packNavResult(cachedNav)
}

/** ISR / 按需刷新前清空导航缓存，避免进程内旧数据 */
export function clearCachedNavFooter(): void {
  cache.clear()
  buildNavInflight = null
}

export async function getCachedNavFooter(cacheTimeInSeconds = 60): Promise<{
  navPages: Page[]
  siteTitle: Title
  logo: DatabaseObjectResponse['icon']
}> {
  const cacheKey = 'nav'
  const cachedNav = cache.get(cacheKey)
  if (cachedNav) {
    setTimeout(() => {
      if (cachedNav.ttl < Date.now()) {
        cache.delete(cacheKey)
      }
    }, Math.max(0, cachedNav.ttl - Date.now()))

    return packNavResult(cachedNav)
  }

  const load = async () => {
    try {
      return await fetchNavFromNotion(cacheTimeInSeconds)
    } catch (error) {
      if (!isTransientNotionError(error)) throw error
      if (!isNotionBuildPhase()) throw error

      console.warn(
        '[getCachedNavFooter] transient error, using fallback nav:',
        error instanceof Error ? error.message : error
      )

      const fallback = buildFallbackNav(cacheTimeInSeconds)
      cache.set(cacheKey, fallback)
      return packNavResult(fallback)
    }
  }

  if (isNotionBuildPhase()) {
    if (!buildNavInflight) {
      buildNavInflight = load()
    }
    return buildNavInflight
  }

  return load()
}
