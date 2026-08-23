import Head from 'next/head'
import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_NAME,
  DEFAULT_OG_IMAGE,
  NEUTRAL_SITE_DESCRIPTION,
  PageSeoFlat,
  SITE_KEYWORDS,
  absoluteUrl,
  getPublicSiteUrl,
} from '@/src/lib/seo/lightSeo'

type LightSeoMetaProps = {
  /** 由 getStaticProps 预计算的扁平 SEO（绝不传 post 对象） */
  seo?: PageSeoFlat | null
  siteName?: string
  /** 无 seo 时用于组合标题（分类名等） */
  pageSubtitle?: string
  isAdmin?: boolean
  /** BLOG 分层 P4:专业版 SEO 去 platform 品牌口径(中性描述/关键词) */
  sitePlan?: 'free' | 'pro'
}

/**
 * 轻量 SEO meta：只消费纯字符串 props，不访问 post / cover 等复杂对象。
 */
export function LightSeoMeta({
  seo,
  siteName,
  pageSubtitle,
  isAdmin,
  sitePlan,
}: LightSeoMetaProps) {
  const name = (siteName || '').trim() || DEFAULT_SITE_NAME
  const sub = (pageSubtitle || '').trim()
  const seoTitle = (seo?.title || '').trim()
  const isPro = sitePlan === 'pro'

  if (isAdmin) {
    return (
      <Head>
        <title>Blog Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
    )
  }

  const pageTitle = seoTitle
    ? seoTitle === name
      ? name
      : `${seoTitle} | ${name}`
    : sub && sub !== name
      ? `${sub} | ${name}`
      : name

  // 专业版:seo.description 为空或为平台默认文案时改用中性描述
  const rawDescription = (seo?.description || '').trim()
  const description =
    isPro && (!rawDescription || rawDescription === DEFAULT_SITE_DESCRIPTION)
      ? NEUTRAL_SITE_DESCRIPTION
      : rawDescription || DEFAULT_SITE_DESCRIPTION
  const baseUrl = getPublicSiteUrl()
  const canonicalPath = seo?.canonicalPath || ''
  const canonical =
    baseUrl && canonicalPath ? absoluteUrl(baseUrl, canonicalPath) : ''
  const image = (seo?.image || '').trim() || DEFAULT_OG_IMAGE
  // 专业版:不追加平台品牌关键词
  const keywords = [seo?.keywords, ...(isPro ? [] : [SITE_KEYWORDS])]
    .filter(Boolean)
    .join(', ')
  const ogType = seo?.canonicalPath?.startsWith('/post/') ? 'article' : 'website'

  return (
    <Head>
      <title>{pageTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="robots" content="index, follow" />
      {canonical ? <link rel="canonical" href={canonical} /> : null}

      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={name} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:locale" content="zh_CN" />
      {image ? <meta property="og:image" content={image} /> : null}
      {canonical ? <meta property="og:url" content={canonical} /> : null}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={description} />
      {image ? <meta name="twitter:image" content={image} /> : null}
    </Head>
  )
}
