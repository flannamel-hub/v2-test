import { useIsBrandCleanSite } from '@/src/components/theme/SitePlanContext'

const PROPLUS_SITE_URL = 'https://proplus.team/'

type ProPlusCreateButtonProps = {
  compact?: boolean
  className?: string
}

/** BLOG 分层 P8:「在PRO+上创作」平台标识在专业版开启「去除平台角标」后隐藏 */
export function ProPlusCreateButton({
  compact = false,
  className = '',
}: ProPlusCreateButtonProps) {
  const brandClean = useIsBrandCleanSite()
  if (brandClean) return null

  return (
    <a
      href={PROPLUS_SITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`proplus-create-btn${compact ? ' proplus-create-btn--compact' : ''}${className ? ` ${className}` : ''}`}
    >
      在PRO+上创作
    </a>
  )
}
