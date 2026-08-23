import { useIsProSite } from '@/src/components/theme/SitePlanContext'

const PROPLUS_URL = 'https://proplus.team/'

/** BLOG 分层 P4:专业版隐藏侧栏底部平台标识 */
export function TweetAsideFooter() {
  const isPro = useIsProSite()
  if (isPro) return null

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
