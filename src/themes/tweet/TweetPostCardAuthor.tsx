import { ProfileWidgetType } from '@/src/lib/blog/format/widget/profile'
import { Tag } from '@/src/types/blog'
import { TweetAvatar } from './TweetAvatar'
import { tweetTagCssVars } from './tweetTagColor'

/** 行1 Tags 单行最多展示数，超出折叠为 +N（P18TWEETFIX） */
const HEADER_TAG_MAX = 2

type TweetPostCardAuthorProps = {
  profile?: ProfileWidgetType | null
  tags?: Tag[]
}

export function TweetPostCardAuthor({
  profile,
  tags,
}: TweetPostCardAuthorProps) {
  const name = profile?.name?.trim() || '本站'
  const rowTags = tags?.filter((tag) => tag.name) ?? []
  const visibleTags = rowTags.slice(0, HEADER_TAG_MAX)
  const overflowCount = rowTags.length - visibleTags.length

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
      {visibleTags.length > 0 ? (
        <div className="tweet-post-card__header-tags">
          {visibleTags.map((tag) => (
            <span
              key={tag.id}
              className="tweet-post-card__tag tweet-post-card__header-tag"
              style={tweetTagCssVars(tag.name)}
            >
              {tag.name}
            </span>
          ))}
          {overflowCount > 0 ? (
            <span className="tweet-post-card__header-tag-more">
              +{overflowCount}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
