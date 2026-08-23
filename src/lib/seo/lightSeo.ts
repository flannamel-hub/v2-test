import CONFIG from '@/blog.config'
import type { Page, Post } from '@/src/types/blog'
import {
  getRuntimeImageHostConfig,
  rewriteManagedAssetUrl,
} from '@/src/lib/media/rewriteManagedAssetUrl'

/**
 * 轻量 SEO：仅在 getStaticProps 中从 Post/Page 提取为纯字符串，
 * _app 只读取此扁平结构，绝不直接访问 post 对象。
 */
export type PageSeoFlat = {
  /** 页面主标题（不含站点名） */
  title: string
  description?: string
  /** 封面 / OG 图（完整 URL） */
  image?: string
  /** 站内路径，用于 canonical，如 /post/foo */
  canonicalPath: string
  /** 本页额外关键词（可选） */
  keywords?: string
}

export const DEFAULT_SITE_DESCRIPTION =
  'PRO+ 一站式寄售与免费博客服务。PRO BLOG 基于 Notion 提供免费、易用的个人博客服务，帮助你快速搭建个人博客与个人主页。'

/** BLOG 分层 P4:专业版 SEO 使用中性站点描述(不含平台品牌与寄售引导) */
export const NEUTRAL_SITE_DESCRIPTION =
  '基于 Notion 的个人博客，记录与分享创作与生活。'

export const DEFAULT_SITE_NAME = 'Blog'

export const SITE_KEYWORDS =
  'PRO+, PRO BLOG, PRO+博客, PRO+一站式寄售, PRO+博客服务, 免费博客服务, 免费博客, 个人博客, 免费个人博客, 个人主页, 博客搭建, Notion博客'

export const DEFAULT_OG_IMAGE: string =
  CONFIG.DEFAULT_POST_COVER ||
  'https://img.x1file.top/disk_r/2026/05/31/6a1bf12f468b6.jpg'

function getDefaultOgImage(): string {
  return rewriteManagedAssetUrl(
    DEFAULT_OG_IMAGE,
    getRuntimeImageHostConfig()
  )
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/** 客户端/SSR 一致：仅读 NEXT_PUBLIC_SITE_URL（商户系统注入） */
export function getPublicSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || '').trim()
  return raw ? stripTrailingSlash(raw) : ''
}

/** 服务端专用：sitemap / robots */
export function resolveServerSiteUrl(headers?: {
  host?: string | string[]
  'x-forwarded-host'?: string | string[]
  'x-forwarded-proto'?: string | string[]
}): string {
  const envUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.BLOG_PUBLIC_URL ||
    ''
  ).trim()
  if (envUrl) return stripTrailingSlash(envUrl)

  const pick = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)
  const host = pick(headers?.['x-forwarded-host']) || pick(headers?.host)
  const proto = pick(headers?.['x-forwarded-proto']) || 'https'
  if (host) return `${proto}://${host.split(',')[0].trim()}`

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`

  return ''
}

export function absoluteUrl(base: string, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${p}` : p
}

function pickPostCoverUrl(post: Post): string {
  return (post.cover?.light?.src || post.cover?.dark?.src || '').trim()
}

function pickTagNames(post: Post): string[] {
  if (!Array.isArray(post.tags)) return []
  return post.tags.map((t) => (t?.name || '').trim()).filter(Boolean)
}

/** 在 getStaticProps 中为文章页构建 SEO（服务端） */
export function buildPostPageSeo(post: Post): PageSeoFlat {
  const cover = pickPostCoverUrl(post)
  const tagNames = pickTagNames(post)
  const categoryName = (post.category?.name || '').trim()
  const excerpt = (post.excerpt || '').trim()

  return {
    title: (post.title || '').trim() || '无标题',
    description: excerpt || DEFAULT_SITE_DESCRIPTION,
    image: cover || getDefaultOgImage(),
    canonicalPath: `/post/${encodeURIComponent(post.slug)}`,
    keywords: [categoryName, ...tagNames].filter(Boolean).join(', '),
  }
}

/** 在 getStaticProps 中为导航自定义页构建 SEO */
export function buildNavPageSeo(page: Page): PageSeoFlat {
  const title = (page.title || page.nav || '').trim() || '页面'
  const slug = (page.slug || '').trim()
  return {
    title,
    description: DEFAULT_SITE_DESCRIPTION,
    image: (page.icon || '').trim() || getDefaultOgImage(),
    canonicalPath: slug ? `/${encodeURIComponent(slug)}` : '/',
  }
}

/** 首页：标题留空，由 LightSeoMeta 使用 Notion 数据库名作为浏览器标签 */
export function buildHomePageSeo(): PageSeoFlat {
  return {
    title: '',
    description: DEFAULT_SITE_DESCRIPTION,
    image: getDefaultOgImage(),
    canonicalPath: '/',
  }
}
