import { useEffect, useMemo, useState } from 'react'
import type { AnnouncementPopupConfig } from '@/src/lib/blog/announcementPopupDefaults'
import { isTweetTheme } from '@/src/themes/tweet/tweetTheme'

type Props = {
  config?: AnnouncementPopupConfig | null
  activeTheme?: string
  /** 公告不展示、或用户关闭后回调，供弹窗广告排队 */
  onSettled?: () => void
}

function buildPopupKey(config: AnnouncementPopupConfig) {
  return [config.title, config.content, config.image].join('|').slice(0, 500)
}

function resolveThemeClass(activeTheme?: string) {
  if (activeTheme === 'gallery') return 'announcement-popup--gallery'
  if (activeTheme === 'tweet-light') return 'announcement-popup--tweet-light'
  if (activeTheme === 'tweet-dark') return 'announcement-popup--tweet-dark'
  if (isTweetTheme(activeTheme)) return 'announcement-popup--tweet'
  return 'announcement-popup--standard'
}

function trimTrailingUrlPunctuation(value: string) {
  let url = value
  let suffix = ''
  while (/[),.;!?，。！？、）]$/.test(url)) {
    suffix = url.slice(-1) + suffix
    url = url.slice(0, -1)
  }
  return { url, suffix }
}

function renderLinkedText(text: string) {
  const nodes: Array<string | JSX.Element> = []
  const pattern = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0]
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const { url, suffix } = trimTrailingUrlPunctuation(raw)
    const href = url.startsWith('www.') ? `https://${url}` : url
    nodes.push(
      <a
        className="announcement-popup__text-link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        key={`${href}-${match.index}`}
      >
        {url}
      </a>
    )
    if (suffix) nodes.push(suffix)
    lastIndex = match.index + raw.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

export function AnnouncementPopup({ config, activeTheme, onSettled }: Props) {
  const hasContent = Boolean(
    config?.enabled &&
      ((config.title || '').trim() ||
        (config.content || '').trim() ||
        (config.image || '').trim())
  )
  const popupKey = useMemo(
    () => (config && hasContent ? buildPopupKey(config) : ''),
    [config, hasContent]
  )
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!config || !hasContent || !popupKey) {
      setVisible(false)
      onSettled?.()
      return
    }
    try {
      const storageKey = `announcement-popup:${popupKey}`
      const closed = sessionStorage.getItem(storageKey) === 'closed'
      setVisible(!closed)
      if (closed) onSettled?.()
    } catch {
      setVisible(true)
    }
  }, [config, hasContent, popupKey, onSettled])

  if (!config || !hasContent || !visible) return null

  const close = () => {
    setVisible(false)
    try {
      sessionStorage.setItem(`announcement-popup:${popupKey}`, 'closed')
    } catch {
      // Ignore storage failures in private browsing modes.
    }
    onSettled?.()
  }
  const themeClass = resolveThemeClass(activeTheme)
  const title = (config.title || '').trim()
  const content = (config.content || '').trim()
  const image = (config.image || '').trim()

  return (
    <div
      className={`announcement-popup ${themeClass}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'announcement-popup-title' : undefined}
    >
      <div className="announcement-popup__backdrop" onClick={close} />
      <section className="announcement-popup__panel">
        <header className="announcement-popup__header">
          {title ? (
            <h2 id="announcement-popup-title" className="announcement-popup__title">
              {title}
            </h2>
          ) : (
            <span className="announcement-popup__title-spacer" aria-hidden="true" />
          )}
          <button
            className="announcement-popup__close"
            type="button"
            aria-label="关闭"
            onClick={close}
          >
            &times;
          </button>
        </header>

        <div className="announcement-popup__body">
          {content ? (
            <div className="announcement-popup__content">
              {renderLinkedText(content)}
            </div>
          ) : null}
          {image ? (
            <div className="announcement-popup__media">
              <img src={image} alt="" />
            </div>
          ) : null}
        </div>

        <footer className="announcement-popup__footer">
          <button
            className="announcement-popup__ack"
            type="button"
            onClick={close}
          >
            知道了
          </button>
        </footer>
      </section>
      <style jsx global>{`
        .announcement-popup {
          --ap-bg: #ffffff;
          --ap-surface: #f3f4f6;
          --ap-text: #111827;
          --ap-muted: #4b5563;
          --ap-border: rgba(17, 24, 39, 0.1);
          --ap-divider: rgba(17, 24, 39, 0.08);
          --ap-backdrop: rgba(17, 24, 39, 0.45);
          --ap-shadow: 0 18px 48px rgba(17, 24, 39, 0.16);
          --ap-link: #1d4ed8;
          --ap-ack-bg: #111827;
          --ap-ack-text: #ffffff;
          --ap-ack-hover: #030712;
          --ap-close-hover: rgba(17, 24, 39, 0.06);
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          pointer-events: none;
        }
        /* standard / anzifan / touchgal 深色：纯黑风格 */
        html.dark .announcement-popup,
        .announcement-popup--standard {
          --ap-bg: #000000;
          --ap-surface: #111111;
          --ap-text: #f4f4f5;
          --ap-muted: #a1a1aa;
          --ap-border: rgba(255, 255, 255, 0.14);
          --ap-divider: rgba(255, 255, 255, 0.1);
          --ap-backdrop: rgba(0, 0, 0, 0.72);
          --ap-shadow: 0 22px 56px rgba(0, 0, 0, 0.65);
          --ap-link: #e4e4e7;
          --ap-ack-bg: #f4f4f5;
          --ap-ack-text: #09090b;
          --ap-ack-hover: #ffffff;
          --ap-close-hover: rgba(255, 255, 255, 0.08);
        }
        html:not(.dark) .announcement-popup--standard {
          --ap-bg: #ffffff;
          --ap-surface: #f3f4f6;
          --ap-text: #111827;
          --ap-muted: #4b5563;
          --ap-border: rgba(17, 24, 39, 0.1);
          --ap-divider: rgba(17, 24, 39, 0.08);
          --ap-backdrop: rgba(17, 24, 39, 0.45);
          --ap-shadow: 0 18px 48px rgba(17, 24, 39, 0.16);
          --ap-link: #1d4ed8;
          --ap-ack-bg: #111827;
          --ap-ack-text: #ffffff;
          --ap-ack-hover: #030712;
          --ap-close-hover: rgba(17, 24, 39, 0.06);
        }
        html.gallery-theme .announcement-popup,
        .announcement-popup--gallery {
          --ap-bg: #ffffff;
          --ap-surface: #f5f5f5;
          --ap-text: #171717;
          --ap-muted: #525252;
          --ap-border: rgba(23, 23, 23, 0.1);
          --ap-divider: rgba(23, 23, 23, 0.08);
          --ap-backdrop: rgba(23, 23, 23, 0.42);
          --ap-shadow: 0 18px 48px rgba(23, 23, 23, 0.14);
          --ap-link: #404040;
          --ap-ack-bg: #171717;
          --ap-ack-text: #ffffff;
          --ap-ack-hover: #000000;
          --ap-close-hover: rgba(23, 23, 23, 0.06);
        }
        /* tweet（灰色）：灰阶深色，区别于 tweet-dark 纯黑 */
        html.tweet-theme .announcement-popup,
        html.tweet-theme.dark:not(.tweet-theme--dark):not(.tweet-theme--light) .announcement-popup,
        .announcement-popup--tweet {
          --ap-bg: #1c1c1c;
          --ap-surface: #2a2a28;
          --ap-text: #eeeeec;
          --ap-muted: #b5b3ad;
          --ap-border: rgba(238, 238, 236, 0.12);
          --ap-divider: rgba(238, 238, 236, 0.08);
          --ap-backdrop: rgba(0, 0, 0, 0.64);
          --ap-shadow: 0 22px 56px rgba(0, 0, 0, 0.55);
          --ap-link: #d1d5db;
          --ap-ack-bg: #eeeeec;
          --ap-ack-text: #111110;
          --ap-ack-hover: #ffffff;
          --ap-close-hover: rgba(238, 238, 236, 0.08);
        }
        html.tweet-theme.tweet-theme--light .announcement-popup,
        .announcement-popup--tweet-light {
          --ap-bg: #ffffff;
          --ap-surface: #f7f9f9;
          --ap-text: #0f1419;
          --ap-muted: #536471;
          --ap-border: rgba(15, 20, 25, 0.12);
          --ap-divider: rgba(15, 20, 25, 0.08);
          --ap-backdrop: rgba(15, 20, 25, 0.36);
          --ap-shadow: 0 18px 48px rgba(15, 20, 25, 0.12);
          --ap-link: #1d9bf0;
          --ap-ack-bg: #0f1419;
          --ap-ack-text: #ffffff;
          --ap-ack-hover: #000000;
          --ap-close-hover: rgba(15, 20, 25, 0.06);
        }
        /* tweet·暗色：纯黑风格（与 standard 深色一致） */
        html.tweet-theme.tweet-theme--dark .announcement-popup,
        .announcement-popup--tweet-dark {
          --ap-bg: #000000;
          --ap-surface: #111111;
          --ap-text: #f4f4f5;
          --ap-muted: #a1a1aa;
          --ap-border: rgba(255, 255, 255, 0.14);
          --ap-divider: rgba(255, 255, 255, 0.1);
          --ap-backdrop: rgba(0, 0, 0, 0.75);
          --ap-shadow: 0 22px 56px rgba(0, 0, 0, 0.7);
          --ap-link: #e4e4e7;
          --ap-ack-bg: #f4f4f5;
          --ap-ack-text: #09090b;
          --ap-ack-hover: #ffffff;
          --ap-close-hover: rgba(255, 255, 255, 0.08);
        }
        .announcement-popup__backdrop {
          position: absolute;
          inset: 0;
          background: var(--ap-backdrop);
          pointer-events: auto;
        }
        .announcement-popup__panel {
          position: relative;
          width: min(420px, 100%);
          max-height: min(720px, calc(100vh - 40px));
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid var(--ap-border);
          border-radius: 12px;
          background: var(--ap-bg);
          color: var(--ap-text);
          box-shadow: var(--ap-shadow);
          pointer-events: auto;
          animation: announcement-popup-rise 160ms ease-out;
        }
        .announcement-popup__header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 20px 18px 14px 22px;
          border-bottom: 1px solid var(--ap-divider);
        }
        .announcement-popup__title {
          flex: 1;
          min-width: 0;
          margin: 0;
          padding-top: 2px;
          color: var(--ap-text);
          font-size: 18px;
          line-height: 1.4;
          font-weight: 650;
          letter-spacing: -0.01em;
        }
        .announcement-popup__title-spacer {
          flex: 1;
          min-height: 28px;
        }
        .announcement-popup__close {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: -2px -2px 0 0;
          padding: 0;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: var(--ap-muted);
          font-size: 24px;
          line-height: 1;
          font-family: Arial, Helvetica, sans-serif;
          cursor: pointer;
          transition: background 140ms ease, color 140ms ease;
        }
        .announcement-popup__close:hover {
          background: var(--ap-close-hover);
          color: var(--ap-text);
        }
        .announcement-popup__body {
          flex: 1;
          min-height: 0;
          overflow: auto;
          padding: 18px 22px 8px;
        }
        .announcement-popup__content {
          margin: 0;
          color: var(--ap-muted);
          font-size: 14px;
          line-height: 1.75;
          white-space: pre-wrap;
        }
        .announcement-popup__media {
          width: 100%;
          margin: 16px 0 0;
          border: 1px solid var(--ap-border);
          border-radius: 8px;
          overflow: hidden;
          background: var(--ap-surface);
        }
        .announcement-popup__media img {
          display: block;
          width: 100%;
          max-height: 180px;
          object-fit: cover;
        }
        .announcement-popup__footer {
          display: flex;
          justify-content: stretch;
          padding: 16px 22px 20px;
        }
        .announcement-popup .announcement-popup__text-link {
          color: var(--ap-link);
          font-weight: 600;
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 3px;
        }
        .announcement-popup .announcement-popup__text-link:hover {
          opacity: 0.85;
        }
        .announcement-popup .announcement-popup__ack {
          width: 100%;
          min-height: 42px;
          padding: 0 16px;
          border: none;
          border-radius: 8px;
          background: var(--ap-ack-bg);
          color: var(--ap-ack-text);
          font-size: 14px;
          font-weight: 650;
          cursor: pointer;
          transition: background 140ms ease, opacity 140ms ease;
        }
        .announcement-popup .announcement-popup__ack:hover {
          background: var(--ap-ack-hover);
        }
        .announcement-popup .announcement-popup__ack:active {
          opacity: 0.88;
        }
        @keyframes announcement-popup-rise {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (max-width: 520px) {
          .announcement-popup {
            align-items: flex-end;
            padding: 12px;
          }
          .announcement-popup__panel {
            width: 100%;
            border-radius: 14px 14px 10px 10px;
          }
          .announcement-popup__header {
            padding: 18px 14px 12px 18px;
          }
          .announcement-popup__body {
            padding: 16px 18px 6px;
          }
          .announcement-popup__footer {
            padding: 14px 18px 18px;
          }
          .announcement-popup__title {
            font-size: 17px;
          }
        }
      `}</style>
    </div>
  )
}
