'use client'

import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { ProPlusCreateButton } from '@/src/components/nav/ProPlusCreateButton'
import { useActiveTheme } from '@/src/components/theme/ActiveThemeProvider'
import { isTweetThemeVariantLocked } from '@/src/themes/tweet/tweetTheme'

type TweetHeaderProps = {
  siteName: string
}

export function TweetHeader({ siteName }: TweetHeaderProps) {
  const activeTheme = useActiveTheme()
  const themeToggleLocked = isTweetThemeVariantLocked(activeTheme)
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <header className="tweet-header">
      <div className="tweet-header__container">
        <Link href="/" className="tweet-header__logo">
          {siteName}
        </Link>
        <nav className="tweet-header__nav">
          {!themeToggleLocked ? (
            <button
              type="button"
              className="tweet-header__theme-btn"
              aria-label={isDark ? '切换浅色模式' : '切换深色模式'}
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
            >
              {isDark ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          ) : null}
          <ProPlusCreateButton />
        </nav>
      </div>
    </header>
  )
}

export function TweetFeedGrid({
  siteName,
  leftAside,
  rightAside,
  children,
}: {
  siteName: string
  leftAside?: React.ReactNode
  rightAside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <>
      <TweetHeader siteName={siteName} />
      <main className="tweet-main">
        <div className="tweet-feed">
          <aside className="tweet-feed__left">
            <div className="tweet-feed__left-inner">{leftAside}</div>
          </aside>
          <div className="tweet-feed__mid">{children}</div>
          <aside className="tweet-feed__right">
            <div className="tweet-feed__right-sticky">
              <div className="tweet-feed__right-inner">{rightAside}</div>
            </div>
          </aside>
        </div>
      </main>
    </>
  )
}
