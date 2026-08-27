/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react'
import type { ShopBannerConfig } from '@/src/lib/blog/shopBannerDefaults'
import { classNames } from '@/src/lib/util'

/** P18-C4-1: shop 主题首页 Banner。单图=静态展示,多图=自动轮播(零依赖)。 */
const AUTO_PLAY_INTERVAL_MS = 5000
const SWIPE_THRESHOLD_PX = 40

function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  )
}

export function ShopBanner({ banner }: { banner: ShopBannerConfig }) {
  const images = banner.images.filter(Boolean)
  const count = images.length
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStartXRef = useRef<number | null>(null)

  const isExternalLink = /^https?:\/\//i.test(banner.link || '')

  useEffect(() => {
    if (count <= 1 || paused) return
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % count)
    }, AUTO_PLAY_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [count, paused])

  if (!banner.enabled || count === 0) return null

  const go = (next: number) => {
    setIndex(((next % count) + count) % count)
  }

  const slides = (
    <>
      {images.map((src, i) => (
        <img
          key={`${src}#${i}`}
          src={src}
          alt={count > 1 ? `Banner ${i + 1}` : 'Banner'}
          loading={i === 0 ? 'eager' : 'lazy'}
          className={classNames(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out',
            i === index ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
        />
      ))}
    </>
  )

  const track = (
    <div
      className="relative h-44 w-full overflow-hidden rounded-2xl border border-neutral-200/70 bg-neutral-100 dark:border-neutral-800/70 dark:bg-neutral-900 sm:h-56 md:h-72 lg:h-80"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStartXRef.current = e.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(e) => {
        const start = touchStartXRef.current
        touchStartXRef.current = null
        if (start == null || count <= 1) return
        const delta = (e.changedTouches[0]?.clientX ?? 0) - start
        if (delta > SWIPE_THRESHOLD_PX) go(index - 1)
        else if (delta < -SWIPE_THRESHOLD_PX) go(index + 1)
      }}
    >
      {slides}
      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="上一张"
            onClick={() => go(index - 1)}
            className="absolute left-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/25 text-white backdrop-blur-sm transition hover:bg-black/40 md:flex"
          >
            <ChevronIcon dir="left" />
          </button>
          <button
            type="button"
            aria-label="下一张"
            onClick={() => go(index + 1)}
            className="absolute right-3 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/25 text-white backdrop-blur-sm transition hover:bg-black/40 md:flex"
          >
            <ChevronIcon dir="right" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`切换到第 ${i + 1} 张`}
                onClick={() => go(i)}
                className={classNames(
                  'h-2 rounded-full transition-all duration-300',
                  i === index
                    ? 'w-6 bg-white'
                    : 'w-2 bg-white/50 hover:bg-white/80'
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )

  if (banner.link) {
    return (
      <a
        href={banner.link}
        target={isExternalLink ? '_blank' : undefined}
        rel={isExternalLink ? 'noopener noreferrer' : undefined}
        className="block focus:outline-none"
        aria-label="Banner 跳转链接"
      >
        {track}
      </a>
    )
  }

  return track
}
