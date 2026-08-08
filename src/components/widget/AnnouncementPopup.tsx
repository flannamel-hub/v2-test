import { useEffect, useMemo, useState } from 'react'
import type { AnnouncementPopupConfig } from '@/src/lib/blog/announcementPopupDefaults'
import { isTweetTheme } from '@/src/themes/tweet/tweetTheme'

type Props = {
  config?: AnnouncementPopupConfig | null
  activeTheme?: string
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

export function AnnouncementPopup({ config, activeTheme }: Props) {
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
      return
    }
    try {
      const storageKey = `announcement-popup:${popupKey}`
      setVisible(sessionStorage.getItem(storageKey) !== 'closed')
    } catch {
      setVisible(true)
    }
  }, [config, hasContent, popupKey])

  if (!config || !hasContent || !visible) return null

  const close = () => {
    setVisible(false)
    try {
      sessionStorage.setItem(`announcement-popup:${popupKey}`, 'closed')
    } catch {
      // Ignore storage failures in private browsing modes.
    }
  }
  const themeClass = resolveThemeClass(activeTheme)

  return (
    <div
      className={`announcement-popup ${themeClass}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="announcement-popup__backdrop" onClick={close} />
      <section
        className="announcement-popup__panel"
        aria-label={config.title || '站务通知'}
      >
        <button
          className="announcement-popup__close"
          type="button"
          aria-label="关闭通知"
          onClick={close}
        >
          &times;
        </button>
        <div className="announcement-popup__accent" aria-hidden="true" />
        <div className="announcement-popup__body">
          <div className="announcement-popup__badge">通知</div>
          {config.title ? (
            <h2 className="announcement-popup__title">{config.title}</h2>
          ) : null}
          {config.content ? (
            <div className="announcement-popup__content">
              {renderLinkedText(config.content)}
            </div>
          ) : null}
          {config.image ? (
            <div className="announcement-popup__media">
              <img src={config.image} alt="" />
            </div>
          ) : null}
          <div className="announcement-popup__actions">
            <button
              className="announcement-popup__ack"
              type="button"
              onClick={close}
            >
              知道了
            </button>
          </div>
        </div>
      </section>
      <style jsx global>{`
        .announcement-popup {
          --ap-bg: #ffffff;
          --ap-surface: #f8fafc;
          --ap-text: #0f172a;
          --ap-muted: #475569;
          --ap-border: rgba(15, 23, 42, 0.1);
          --ap-backdrop: rgba(15, 23, 42, 0.4);
          --ap-shadow: 0 24px 64px rgba(15, 23, 42, 0.18);
          --ap-accent: #2563eb;
          --ap-link: #2563eb;
          --ap-badge-bg: rgba(37, 99, 235, 0.1);
          --ap-badge-text: #1d4ed8;
          --ap-ack-bg: transparent;
          --ap-ack-border: rgba(15, 23, 42, 0.16);
          --ap-ack-text: #0f172a;
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          pointer-events: none;
        }
        /* standard 默认按深色壳层，再用 html:not(.dark) 覆盖为浅色 */
        html.dark .announcement-popup,
        .announcement-popup--standard {
          --ap-bg: #141820;
          --ap-surface: #1c222d;
          --ap-text: #f1f5f9;
          --ap-muted: #94a3b8;
          --ap-border: rgba(148, 163, 184, 0.18);
          --ap-backdrop: rgba(2, 6, 23, 0.64);
          --ap-shadow: 0 28px 80px rgba(0, 0, 0, 0.48);
          --ap-accent: #60a5fa;
          --ap-link: #93c5fd;
          --ap-badge-bg: rgba(96, 165, 250, 0.14);
          --ap-badge-text: #93c5fd;
          --ap-ack-bg: transparent;
          --ap-ack-border: rgba(148, 163, 184, 0.28);
          --ap-ack-text: #f1f5f9;
        }
        html:not(.dark) .announcement-popup--standard {
          --ap-bg: #ffffff;
          --ap-surface: #f8fafc;
          --ap-text: #0f172a;
          --ap-muted: #475569;
          --ap-border: rgba(15, 23, 42, 0.1);
          --ap-backdrop: rgba(15, 23, 42, 0.4);
          --ap-shadow: 0 24px 64px rgba(15, 23, 42, 0.18);
          --ap-accent: #2563eb;
          --ap-link: #2563eb;
          --ap-badge-bg: rgba(37, 99, 235, 0.1);
          --ap-badge-text: #1d4ed8;
          --ap-ack-bg: transparent;
          --ap-ack-border: rgba(15, 23, 42, 0.16);
          --ap-ack-text: #0f172a;
        }
        /* Gallery：浅色通知风 */
        html.gallery-theme .announcement-popup,
        .announcement-popup--gallery {
          --ap-bg: #ffffff;
          --ap-surface: #f4f6f8;
          --ap-text: #111827;
          --ap-muted: #4b5563;
          --ap-border: rgba(17, 24, 39, 0.1);
          --ap-backdrop: rgba(15, 23, 42, 0.38);
          --ap-shadow: 0 24px 64px rgba(15, 23, 42, 0.16);
          --ap-accent: #65a30d;
          --ap-link: #3f6212;
          --ap-badge-bg: rgba(101, 163, 13, 0.12);
          --ap-badge-text: #3f6212;
          --ap-ack-bg: transparent;
          --ap-ack-border: rgba(17, 24, 39, 0.14);
          --ap-ack-text: #111827;
        }
        /* Tweet 默认 / tweet-dark：深色 */
        html.tweet-theme .announcement-popup,
        .announcement-popup--tweet {
          --ap-bg: #202327;
          --ap-surface: #2a2e34;
          --ap-text: #f5f7fb;
          --ap-muted: #a8b3c2;
          --ap-border: rgba(255, 255, 255, 0.12);
          --ap-backdrop: rgba(0, 0, 0, 0.58);
          --ap-shadow: 0 28px 80px rgba(0, 0, 0, 0.5);
          --ap-accent: #1d9bf0;
          --ap-link: #66c2ff;
          --ap-badge-bg: rgba(29, 155, 240, 0.16);
          --ap-badge-text: #8fd0ff;
          --ap-ack-bg: transparent;
          --ap-ack-border: rgba(255, 255, 255, 0.2);
          --ap-ack-text: #f5f7fb;
        }
        /* tweet-light：浅色 */
        html.tweet-theme.tweet-theme--light .announcement-popup,
        .announcement-popup--tweet-light {
          --ap-bg: #ffffff;
          --ap-surface: #f7f9fa;
          --ap-text: #0f1419;
          --ap-muted: #536471;
          --ap-border: rgba(15, 20, 25, 0.12);
          --ap-backdrop: rgba(15, 23, 42, 0.34);
          --ap-shadow: 0 24px 64px rgba(15, 23, 42, 0.14);
          --ap-accent: #1d9bf0;
          --ap-link: #0f7ec8;
          --ap-badge-bg: rgba(29, 155, 240, 0.1);
          --ap-badge-text: #0f7ec8;
          --ap-ack-bg: transparent;
          --ap-ack-border: rgba(15, 20, 25, 0.16);
          --ap-ack-text: #0f1419;
        }
        html.tweet-theme.tweet-theme--dark .announcement-popup,
        .announcement-popup--tweet-dark {
          --ap-bg: #000000;
          --ap-surface: #16181c;
          --ap-text: #e7e9ea;
          --ap-muted: #8b98a5;
          --ap-border: rgba(255, 255, 255, 0.14);
          --ap-backdrop: rgba(0, 0, 0, 0.72);
          --ap-shadow: 0 28px 80px rgba(0, 0, 0, 0.6);
          --ap-accent: #1d9bf0;
          --ap-link: #66c2ff;
          --ap-badge-bg: rgba(29, 155, 240, 0.16);
          --ap-badge-text: #8fd0ff;
          --ap-ack-bg: transparent;
          --ap-ack-border: rgba(255, 255, 255, 0.22);
          --ap-ack-text: #e7e9ea;
        }
        .announcement-popup__backdrop {
          position: absolute;
          inset: 0;
          background: var(--ap-backdrop);
          pointer-events: auto;
        }
        .announcement-popup__panel {
          position: relative;
          display: flex;
          width: min(440px, 100%);
          max-height: min(720px, calc(100vh - 40px));
          overflow: hidden;
          border: 1px solid var(--ap-border);
          border-radius: 14px;
          background: var(--ap-bg);
          color: var(--ap-text);
          box-shadow: var(--ap-shadow);
          pointer-events: auto;
          animation: announcement-popup-rise 180ms ease-out;
        }
        .announcement-popup__accent {
          width: 4px;
          flex-shrink: 0;
          background: var(--ap-accent);
        }
        .announcement-popup__close {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 2;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: 1px solid var(--ap-border);
          border-radius: 8px;
          background: var(--ap-surface);
          color: var(--ap-muted);
          font-size: 22px;
          line-height: 1;
          font-family: Arial, Helvetica, sans-serif;
          cursor: pointer;
          transition:
            background 160ms ease,
            border-color 160ms ease,
            color 160ms ease;
        }
        .announcement-popup__close:hover {
          border-color: var(--ap-accent);
          color: var(--ap-text);
        }
        .announcement-popup__body {
          flex: 1;
          min-width: 0;
          padding: 22px 44px 20px 20px;
        }
        .announcement-popup__badge {
          display: inline-flex;
          align-items: center;
          margin: 0 0 12px;
          padding: 3px 9px;
          border-radius: 6px;
          background: var(--ap-badge-bg);
          color: var(--ap-badge-text);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          line-height: 1.4;
        }
        .announcement-popup__title {
          margin: 0;
          color: var(--ap-text);
          font-size: 20px;
          line-height: 1.35;
          font-weight: 700;
        }
        .announcement-popup__content {
          margin: 10px 0 0;
          color: var(--ap-muted);
          font-size: 14px;
          line-height: 1.7;
          white-space: pre-wrap;
        }
        .announcement-popup__media {
          width: 100%;
          margin: 16px 0 0;
          max-height: 160px;
          border: 1px solid var(--ap-border);
          border-radius: 10px;
          overflow: hidden;
          background: var(--ap-surface);
        }
        .announcement-popup__media img {
          width: 100%;
          height: 100%;
          max-height: 160px;
          object-fit: cover;
          display: block;
        }
        .announcement-popup__actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 18px;
        }
        .announcement-popup .announcement-popup__text-link {
          color: var(--ap-link);
          font-weight: 600;
          text-decoration: underline;
          text-decoration-thickness: 1px;
          text-underline-offset: 3px;
        }
        .announcement-popup .announcement-popup__text-link:hover {
          opacity: 0.82;
        }
        .announcement-popup .announcement-popup__ack {
          min-height: 36px;
          padding: 0 16px;
          border: 1px solid var(--ap-ack-border);
          border-radius: 8px;
          background: var(--ap-ack-bg);
          color: var(--ap-ack-text);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition:
            background 160ms ease,
            border-color 160ms ease;
        }
        .announcement-popup .announcement-popup__ack:hover {
          border-color: var(--ap-accent);
          background: var(--ap-surface);
        }
        @keyframes announcement-popup-rise {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @media (max-width: 520px) {
          .announcement-popup {
            align-items: flex-end;
            padding: 12px;
          }
          .announcement-popup__panel {
            border-radius: 12px;
          }
          .announcement-popup__body {
            padding: 18px 40px 16px 16px;
          }
          .announcement-popup__title {
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  )
}
