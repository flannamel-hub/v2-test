import { isFullPage } from '@notionhq/client'
import { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import { getAll } from '@/src/lib/notion/getDatabase'

/** 与 AdminDashboard SPECIAL_PAGE_SLUGS 保持一致 */
export const RESERVED_POST_SLUGS = new Set([
  'announcement',
  'about',
  'download',
  'theme-config',
  'gallery-ad',
  'vending',
  'announcement-popup',
  'popup-ad',
  'click-ad',
  'social-links',
])

/**
 * 后台新建文章默认 slug（与 handleCreate 一致：p- + 时间戳 base36）
 */
export function generateAdminPostSlug(): string {
  return `p-${Date.now().toString(36)}`
}

/** 在已占用集合中生成不重复的 slug */
export function generateUniquePostSlug(occupied: Set<string>): string {
  for (let i = 0; i < 12; i++) {
    const base = generateAdminPostSlug()
    const slug =
      i === 0
        ? base
        : `${base}${Math.random().toString(36).slice(2, 5)}`
    if (!occupied.has(slug) && !RESERVED_POST_SLUGS.has(slug)) {
      return slug
    }
  }
  return `${generateAdminPostSlug()}${Math.random().toString(36).slice(2, 8)}`
}

function readSlugFromPageProperties(
  properties: PageObjectResponse['properties']
): string {
  const p = properties as Record<
    string,
    { type?: string; rich_text?: { plain_text?: string }[] }
  >
  const raw =
    p.slug?.rich_text?.[0]?.plain_text ||
    p.Slug?.rich_text?.[0]?.plain_text ||
    ''
  return typeof raw === 'string' ? raw.trim() : ''
}

/** 读取 Notion 库内已有 slug，用于入库时防重复 */
export async function loadOccupiedPostSlugs(): Promise<Set<string>> {
  const pages = await getAll()
  const slugs = new Set<string>(RESERVED_POST_SLUGS)
  for (const page of pages) {
    if (!isFullPage(page)) continue
    const slug = readSlugFromPageProperties(page.properties)
    if (slug) slugs.add(slug)
  }
  return slugs
}

export function readSlugFromNotionPage(
  page: PageObjectResponse
): string {
  if (!isFullPage(page)) return ''
  return readSlugFromPageProperties(page.properties)
}
