import CONFIG from '@/blog.config'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { ProfileWidgetType } from '@/src/lib/blog/format/widget/profile'
import { TweetAvatar } from './TweetAvatar'
import { TweetPostCardShare } from './TweetPostCardShare'
import { tweetCategoryRgbTriple } from './tweetCategoryColor'

const { CATEGORY } = CONFIG.DEFAULT_SPECIAL_PAGES

type TweetPostCardAuthorProps = {
  profile?: ProfileWidgetType | null
  categoryName?: string
  categoryId?: string
  dateLabel?: string
  dateTime?: string
  slug: string
}

export function TweetPostCardAuthor({
  profile,
  categoryName,
  categoryId,
  dateLabel,
  dateTime,
  slug,
}: TweetPostCardAuthorProps) {
  const name = profile?.name?.trim() || '本站'
  const categoryHref =
    categoryName && categoryId ? `/${CATEGORY}/${categoryId}` : ''

  return (
    <div className="tweet-post-card__author">
      <TweetAvatar
        profile={profile}
        className="tweet-post-card__author-avatar-wrap"
        imgClassName="tweet-avatar__img tweet-post-card__author-avatar"
        fallbackClassName="tweet-post-card__author-avatar tweet-post-card__author-fallback"
        fallbackText={name.charAt(0).toUpperCase()}
      />
      <div className="tweet-post-card__author-meta">
        <span className="tweet-post-card__author-name">{name}</span>
        <span className="tweet-post-card__author-badge">站长</span>
        {categoryName && categoryHref ? (
          <Link
            href={categoryHref}
            className="tweet-post-card__category"
            style={
              {
                '--tweet-cat-rgb': tweetCategoryRgbTriple(categoryName),
              } as CSSProperties
            }
          >
            {categoryName}
          </Link>
        ) : null}
      </div>
      <div className="tweet-post-card__author-actions">
        {dateLabel ? (
          <time className="tweet-post-card__date" dateTime={dateTime}>
            {dateLabel}
          </time>
        ) : null}
        <TweetPostCardShare slug={slug} />
      </div>
    </div>
  )
}
