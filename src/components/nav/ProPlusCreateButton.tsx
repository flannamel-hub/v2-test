const PROPLUS_SITE_URL = 'https://proplus.team/'

type ProPlusCreateButtonProps = {
  compact?: boolean
  className?: string
}

export function ProPlusCreateButton({
  compact = false,
  className = '',
}: ProPlusCreateButtonProps) {
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
