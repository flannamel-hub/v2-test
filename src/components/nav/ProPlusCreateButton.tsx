import { useIsProSite } from '@/src/components/theme/SitePlanContext'

const PROPLUS_SITE_URL = 'https://proplus.team/'

type ProPlusCreateButtonProps = {
  compact?: boolean
  className?: string
}

/** BLOG 分层 P4:专业版隐藏「在PRO+上创作」平台标识 */
export function ProPlusCreateButton({
  compact = false,
  className = '',
}: ProPlusCreateButtonProps) {
  const isPro = useIsProSite()
  if (isPro) return null

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
