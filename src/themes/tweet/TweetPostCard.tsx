import { PostNavLink } from '@/src/components/navigation/PostNavStallGuard'
import { ProfileWidgetType } from '@/src/lib/blog/format/widget/profile'
import { TweetFeedMediaMap } from '@/src/lib/tweet/loadTweetFeedMedia'
import { Post } from '@/src/types/blog'
import { formatTweetDate } from './tweetSearch'
import { TweetPostCardCoverLazy } from './TweetPostCardCoverLazy'
import { TweetPostCardMedia } from './TweetPostCardMedia'
import { tweetTagCssVars } from './tweetTagColor'
import {
  isDeferredTweetBodyImage,
  resolveTweetCardMedia,
} from './tweetFeedMedia'

/** 行2 Tags 单行最多展示数，超出折叠为 +N（P18TWEETFIX） */
const TITLE_TAG_MAX = 2

type TweetPostCardProps = {
  post: Post
  profile?: ProfileWidgetType | null
  feedMedia?: TweetFeedMediaMap | null
}

export function TweetPostCard({
  post,
  profile,
  feedMedia,
}: TweetPostCardProps) {
  const tags = post.tags?.filter((t) => t.name) ?? []
  const dateLabel = formatTweetDate(post.date?.created)
  const excerpt = post.excerpt?.trim()
  const media = resolveTweetCardMedia(post, feedMedia)
  const lazyBodyCover = isDeferredTweetBodyImage(post.slug, feedMedia)
  const showMedia = media.mode !== 'none' || lazyBodyCover
  const postHref = `/post/${post.slug}`
  const visibleTags = tags.slice(0, TITLE_TAG_MAX)
  const overflowCount = tags.length - visibleTags.length

  return (
    <article className="tweet-post-card">
      <div className="tweet-post-card__shell">
        <PostNavLink href={postHref} navKey={post.slug} className="tweet-post-card__article">
          <div className="tweet-post-card__body">
            <div className="tweet-post-card__title-row">
              <h2 className="tweet-post-card__title">{post.title}</h2>
              {visibleTags.length > 0 ? (
                <div className="tweet-post-card__title-tags">
                  {visibleTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="tweet-post-card__tag tweet-post-card__title-tag"
                      style={tweetTagCssVars(tag.name)}
                    >
                      {tag.name}
                    </span>
                  ))}
                  {overflowCount > 0 ? (
                    <span className="tweet-post-card__title-tag-more">
                      +{overflowCount}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {dateLabel ? (
                <time
                  className="tweet-post-card__date tweet-post-card__author-date"
                  dateTime={post.date?.created}
                >
                  {dateLabel}
                </time>
              ) : null}
            </div>

            {excerpt ? (
              <p className="tweet-post-card__excerpt">{excerpt}</p>
            ) : null}

            {showMedia ? (
              <div className="tweet-post-card__media-block">
                {media.mode !== 'none' ? (
                  <TweetPostCardMedia media={media} />
                ) : (
                  <TweetPostCardCoverLazy slug={post.slug} />
                )}
              </div>
            ) : null}
          </div>
        </PostNavLink>
        <div className="tweet-post-card__footer">
          <PostNavLink href={postHref} navKey={post.slug} className="tweet-post-card__read-more">
            阅读全文→
          </PostNavLink>
        </div>
      </div>
    </article>
  )
}
