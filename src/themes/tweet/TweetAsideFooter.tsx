import { useIsBrandCleanSite, useSiteBrand } from '@/src/components/theme/SitePlanContext'

const PROPLUS_URL = 'https://proplus.team/'

/** BLOG 分层 P8:专业版开启「去除平台角标」后,侧栏底部转为「Powered by 站名」 */
export function TweetAsideFooter() {
  const brandClean = useIsBrandCleanSite()
  const brand = useSiteBrand()

  if (brandClean) {
    return (
      <footer className="tweet-aside-footer">Powered by {brand.siteName?.trim() || '本站'}</footer>
    )
  }

  return (
    <footer className="tweet-aside-footer">
      Powered by{' '}
      <a
        href={PROPLUS_URL}
        className="tweet-aside-footer__link"
        target="_blank"
        rel="noopener noreferrer"
      >
        PRO+
      </a>
    </footer>
  )
}
