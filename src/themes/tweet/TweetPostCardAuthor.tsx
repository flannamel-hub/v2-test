import { ProfileWidgetType } from '@/src/lib/blog/format/widget/profile'
import { TweetAvatar } from './TweetAvatar'

type TweetPostCardAuthorProps = {
  profile?: ProfileWidgetType | null
  dateIso?: string
  dateLabel?: string | null
}

export function TweetPostCardAuthor({
  profile,
  dateIso,
  dateLabel,
}: TweetPostCardAuthorProps) {
  const name = profile?.name?.trim() || '本站'

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
      </div>
      {dateLabel ? (
        <time className="tweet-post-card__date tweet-post-card__author-date" dateTime={dateIso}>
          {dateLabel}
        </time>
      ) : null}
    </div>
  )
}
