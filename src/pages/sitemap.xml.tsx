import { GetServerSideProps } from 'next'
import { resolveServerSiteUrl } from '@/src/lib/seo/lightSeo'
import { getPosts } from '@/src/lib/notion/getBlogData'
import {
  formatPosts,
  FORMAT_POST_LIST_OPTIONS,
} from '@/src/lib/blog/format/post'
import { filterVisiblePosts } from '@/src/lib/blog/hiddenPosts'
import { ApiScope } from '@/src/types/notion'

type UrlEntry = { loc: string; lastmod?: string }

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toW3CDate(value?: string): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString().split('T')[0]
}

function buildXml(base: string, entries: UrlEntry[]): string {
  const body = entries
    .map((e) => {
      const loc = `<loc>${xmlEscape(`${base}${e.loc}`)}</loc>`
      const lastmod = e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''
      return `  <url>${loc}${lastmod}</url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

function Sitemap() {
  return null
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const base = resolveServerSiteUrl(req.headers)

  const staticPaths = [
    '/',
    '/category',
    '/tag',
    '/archive',
    '/about',
    '/friends',
    '/download',
  ]
  const entries: UrlEntry[] = staticPaths.map((p) => ({ loc: p }))

  try {
    const raw = await getPosts(ApiScope.Archive)
    // 隐藏文章不进 sitemap（用户拍板）；直链仍可访问
    const posts = filterVisiblePosts(
      await formatPosts(raw, FORMAT_POST_LIST_OPTIONS)
    )
    const categoryIds = new Set<string>()
    const tagIds = new Set<string>()

    for (const post of posts) {
      if (!post?.slug) continue
      entries.push({
        loc: `/post/${encodeURIComponent(post.slug)}`,
        lastmod: toW3CDate(post.date?.updated || post.date?.created),
      })
      if (post.category?.id) categoryIds.add(post.category.id)
      for (const tag of post.tags || []) {
        if (tag?.id) tagIds.add(tag.id)
      }
    }

    Array.from(categoryIds).forEach((id) => {
      entries.push({ loc: `/category/${encodeURIComponent(id)}` })
    })
    Array.from(tagIds).forEach((id) => {
      entries.push({ loc: `/tag/${encodeURIComponent(id)}` })
    })
  } catch (error) {
    console.warn('sitemap: failed to load posts, using static paths only', error)
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader(
    'Cache-Control',
    'public, max-age=0, s-maxage=86400, stale-while-revalidate=43200'
  )
  res.write(buildXml(base, entries))
  res.end()

  return { props: {} }
}

export default Sitemap
