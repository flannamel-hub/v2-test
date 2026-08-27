/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FiArrowRight } from 'react-icons/fi'
import type { ShopBannerConfig } from '@/src/lib/blog/shopBannerDefaults'
import { classNames } from '@/src/lib/util'

/**
 * P18-C4-4A:shop 首页 Banner(完全还原独角数卡 Home.vue Hero)。
 * P18C43-D2:删除左右箭头按钮,圆点导航改为底部正中央悬浮。
 * rounded-2xl 卡片容器;内容区 min-h 阶梯高度;bg-black/50 全遮罩;
 * 文字层固定不随图切换(标题/副标题中下区,「查看更多」按钮在下,忽略 banner.link);
 * 多图:底部居中圆点(active 长条/白色半透明)+ 自动轮播(零依赖)+ 悬停暂停 + 触摸滑动。
 */
const AUTO_PLAY_INTERVAL_MS = 5000
const SWIPE_THRESHOLD_PX = 40

export function ShopBanner({
  banner,
  headline,
  subline,
}: {
  banner: ShopBannerConfig
  /** Banner 两行文字(来自 Notion profile widget):大字 title / 小字 excerpt */
  headline?: string
  subline?: string
}) {
  const images = banner.images.filter(Boolean)
  const count = images.length
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStartXRef = useRef<number | null>(null)

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
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out',
            i === index ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
        />
      ))}
    </>
  )

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-neutral-200/70 bg-neutral-100 dark:border-neutral-800/70 dark:bg-neutral-900"
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
      {/* 全图遮罩(独角数卡同款) */}
      <div className="absolute inset-0 bg-black/50" aria-hidden />

      {/* 文字层:固定不随图切换;标题/副标题中下区,按钮在下(P18C43-D2:箭头已删,顶部占位保留底部锚定) */}
      <div className="relative flex min-h-[200px] flex-col justify-between p-5 sm:min-h-[240px] sm:p-6 md:min-h-[320px] md:p-10 lg:min-h-[420px]">
        <div aria-hidden className="h-0" />

        <div className="flex flex-col items-start gap-2 sm:gap-3">
          {headline ? (
            <h2 className="max-w-4xl text-xl font-semibold tracking-[-0.02em] text-white sm:text-2xl md:text-3xl">
              {headline}
            </h2>
          ) : null}
          {subline ? (
            <p className="max-w-3xl text-xs leading-relaxed text-gray-100 sm:text-sm">
              {subline}
            </p>
          ) : null}
          <Link
            href="/archive"
            className="mt-1 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/40 px-4 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/30"
          >
            查看更多
            <FiArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>

      {/* P18C43-D2:圆点导航改为底部正中央悬浮(原右上箭头+左下圆点已删) */}
      {count > 1 ? (
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
                  : 'w-2 bg-white/45 hover:bg-white/70'
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
