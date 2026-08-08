import { useEffect, useMemo, useState } from 'react'
import type { PopupAdConfig } from '@/src/lib/blog/popupAdDefaults'
import { isTweetTheme } from '@/src/themes/tweet/tweetTheme'

type Props = {
  config?: PopupAdConfig | null
  activeTheme?: string
  /** 公告弹窗已结束（关闭或不展示）后才允许弹广告 */
  announceSettled?: boolean
  /** 仅首页展示 */
  isHomePage?: boolean
}

const SESSION_KEY = 'popup-ad:session-shown'

function resolveThemeClass(activeTheme?: string) {
  if (activeTheme === 'gallery') return 'popup-ad--gallery'
  if (activeTheme === 'tweet-light') return 'popup-ad--tweet-light'
  if (activeTheme === 'tweet-dark') return 'popup-ad--tweet-dark'
  if (isTweetTheme(activeTheme)) return 'popup-ad--tweet'
  return 'popup-ad--standard'
}

export function PopupAd({
  config,
  activeTheme,
  announceSettled = true,
  isHomePage = false,
}: Props) {
  const hasContent = Boolean(
    config?.enabled &&
      ((config.title || '').trim() ||
        (config.content || '').trim() ||
        (config.image || '').trim()) &&
      (config.buttonUrl || '').trim()
  )
  const ctaText = useMemo(() => {
    const text = (config?.buttonText || '').trim()
    return text || '了解详情'
  }, [config?.buttonText])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isHomePage || !announceSettled || !config || !hasContent) {
      setVisible(false)
      return
    }
    try {
      if (sessionStorage.getItem(SESSION_KEY) === '1') {
        setVisible(false)
        return
      }
    } catch {
      // private mode: still show once in this mount
    }
    setVisible(true)
  }, [isHomePage, announceSettled, config, hasContent])

  if (!config || !hasContent || !visible || !isHomePage || !announceSettled) {
    return null
  }

  const markShownAndClose = () => {
    setVisible(false)
    try {
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      // ignore
    }
  }

  const themeClass = resolveThemeClass(activeTheme)
  const title = (config.title || '').trim()
  const content = (config.content || '').trim()
  const image = (config.image || '').trim()
  const href = (config.buttonUrl || '').trim()

  return (
    <div
      className={`popup-ad ${themeClass}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'popup-ad-title' : undefined}
    >
      <div className="popup-ad__backdrop" onClick={markShownAndClose} />
      <section className="popup-ad__panel">
        <button
          className="popup-ad__close"
          type="button"
          aria-label="关闭广告"
          onClick={markShownAndClose}
        >
          &times;
        </button>
        {image ? (
          <a
            className="popup-ad__media"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={markShownAndClose}
          >
            <img src={image} alt="" />
          </a>
        ) : null}
        <div className="popup-ad__body">
          {title ? (
            <h2 id="popup-ad-title" className="popup-ad__title">
              {title}
            </h2>
          ) : null}
          {content ? (
            <p className="popup-ad__content">{content}</p>
          ) : null}
          <a
            className="popup-ad__cta"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={markShownAndClose}
          >
            {ctaText}
          </a>
        </div>
      </section>
      <style jsx global>{`
        .popup-ad {
          --pa-bg: #ffffff;
          --pa-surface: #f5f5f5;
          --pa-text: #111827;
          --pa-muted: #4b5563;
          --pa-border: rgba(17, 24, 39, 0.1);
          --pa-backdrop: rgba(17, 24, 39, 0.48);
          --pa-shadow: 0 24px 72px rgba(17, 24, 39, 0.22);
          --pa-cta-bg: #111827;
          --pa-cta-text: #ffffff;
          --pa-cta-hover: #030712;
          --pa-close-hover: rgba(17, 24, 39, 0.06);
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          pointer-events: none;
        }
        html.dark .popup-ad,
        .popup-ad--standard {
          --pa-bg: #000000;
          --pa-surface: #111111;
          --pa-text: #f4f4f5;
          --pa-muted: #a1a1aa;
          --pa-border: rgba(255, 255, 255, 0.14);
          --pa-backdrop: rgba(0, 0, 0, 0.72);
          --pa-shadow: 0 24px 72px rgba(0, 0, 0, 0.65);
          --pa-cta-bg: #f4f4f5;
          --pa-cta-text: #09090b;
          --pa-cta-hover: #ffffff;
          --pa-close-hover: rgba(255, 255, 255, 0.08);
        }
        html:not(.dark) .popup-ad--standard {
          --pa-bg: #ffffff;
          --pa-surface: #f5f5f5;
          --pa-text: #111827;
          --pa-muted: #4b5563;
          --pa-border: rgba(17, 24, 39, 0.1);
          --pa-backdrop: rgba(17, 24, 39, 0.48);
          --pa-shadow: 0 24px 72px rgba(17, 24, 39, 0.22);
          --pa-cta-bg: #111827;
          --pa-cta-text: #ffffff;
          --pa-cta-hover: #030712;
          --pa-close-hover: rgba(17, 24, 39, 0.06);
        }
        html.gallery-theme .popup-ad,
        .popup-ad--gallery {
          --pa-bg: #ffffff;
          --pa-surface: #f5f5f5;
          --pa-text: #171717;
          --pa-muted: #525252;
          --pa-border: rgba(23, 23, 23, 0.1);
          --pa-backdrop: rgba(23, 23, 23, 0.45);
          --pa-shadow: 0 24px 72px rgba(23, 23, 23, 0.18);
          --pa-cta-bg: #171717;
          --pa-cta-text: #ffffff;
          --pa-cta-hover: #000000;
          --pa-close-hover: rgba(23, 23, 23, 0.06);
        }
        html.tweet-theme .popup-ad,
        html.tweet-theme.dark:not(.tweet-theme--dark):not(.tweet-theme--light) .popup-ad,
        .popup-ad--tweet {
          --pa-bg: #1c1c1c;
          --pa-surface: #2a2a28;
          --pa-text: #eeeeec;
          --pa-muted: #b5b3ad;
          --pa-border: rgba(238, 238, 236, 0.12);
          --pa-backdrop: rgba(0, 0, 0, 0.64);
          --pa-shadow: 0 24px 72px rgba(0, 0, 0, 0.55);
          --pa-cta-bg: #eeeeec;
          --pa-cta-text: #111110;
          --pa-cta-hover: #ffffff;
          --pa-close-hover: rgba(238, 238, 236, 0.08);
        }
        html.tweet-theme.tweet-theme--light .popup-ad,
        .popup-ad--tweet-light {
          --pa-bg: #ffffff;
          --pa-surface: #f7f9f9;
          --pa-text: #0f1419;
          --pa-muted: #536471;
          --pa-border: rgba(15, 20, 25, 0.12);
          --pa-backdrop: rgba(15, 20, 25, 0.4);
          --pa-shadow: 0 24px 72px rgba(15, 20, 25, 0.16);
          --pa-cta-bg: #0f1419;
          --pa-cta-text: #ffffff;
          --pa-cta-hover: #000000;
          --pa-close-hover: rgba(15, 20, 25, 0.06);
        }
        html.tweet-theme.tweet-theme--dark .popup-ad,
        .popup-ad--tweet-dark {
          --pa-bg: #000000;
          --pa-surface: #111111;
          --pa-text: #f4f4f5;
          --pa-muted: #a1a1aa;
          --pa-border: rgba(255, 255, 255, 0.14);
          --pa-backdrop: rgba(0, 0, 0, 0.75);
          --pa-shadow: 0 24px 72px rgba(0, 0, 0, 0.7);
          --pa-cta-bg: #f4f4f5;
          --pa-cta-text: #09090b;
          --pa-cta-hover: #ffffff;
          --pa-close-hover: rgba(255, 255, 255, 0.08);
        }
        .popup-ad__backdrop {
          position: absolute;
          inset: 0;
          background: var(--pa-backdrop);
          pointer-events: auto;
        }
        .popup-ad__panel {
          position: relative;
          width: min(440px, 100%);
          max-height: min(780px, calc(100vh - 40px));
          overflow: hidden;
          border: 1px solid var(--pa-border);
          border-radius: 16px;
          background: var(--pa-bg);
          color: var(--pa-text);
          box-shadow: var(--pa-shadow);
          pointer-events: auto;
          animation: popup-ad-rise 180ms ease-out;
        }
        .popup-ad__close {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 2;
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: none;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.35);
          color: #fff;
          font-size: 24px;
          line-height: 1;
          font-family: Arial, Helvetica, sans-serif;
          cursor: pointer;
          transition: background 140ms ease;
        }
        .popup-ad__close:hover {
          background: rgba(0, 0, 0, 0.5);
        }
        .popup-ad__media {
          display: block;
          width: 100%;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          background: var(--pa-surface);
        }
        .popup-ad__media img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .popup-ad__body {
          padding: 20px 22px 22px;
        }
        .popup-ad__title {
          margin: 0;
          font-size: 20px;
          line-height: 1.35;
          font-weight: 750;
        }
        .popup-ad__content {
          margin: 10px 0 0;
          color: var(--pa-muted);
          font-size: 14px;
          line-height: 1.7;
          white-space: pre-wrap;
        }
        .popup-ad .popup-ad__cta {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 44px;
          margin-top: 18px;
          border-radius: 10px;
          background: var(--pa-cta-bg);
          color: var(--pa-cta-text);
          font-size: 14px;
          font-weight: 700;
          text-decoration: none;
          transition: background 140ms ease, opacity 140ms ease;
        }
        .popup-ad .popup-ad__cta:hover {
          background: var(--pa-cta-hover);
        }
        @keyframes popup-ad-rise {
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
          .popup-ad {
            align-items: flex-end;
            padding: 12px;
          }
          .popup-ad__panel {
            width: 100%;
            border-radius: 16px 16px 12px 12px;
          }
          .popup-ad__title {
            font-size: 18px;
          }
        }
      `}</style>
    </div>
  )
}
