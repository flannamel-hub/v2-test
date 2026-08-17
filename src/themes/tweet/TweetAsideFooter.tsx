const PROPLUS_URL = 'https://proplus.team/'

export function TweetAsideFooter() {
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
