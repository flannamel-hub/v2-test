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

/**
 * P18TWEETCARD:卡片头部重制(参照早期版本)
 * 行1 = 标题(大字,左) + 日期(右 muted 小字,baseline 对齐);
 * 行2 = Tags(暖色板 chips,标题下方,全部显示不折叠);
 * 无站名/无头像/无徽章。
 */
// 全部显示,不折叠(用户 2026-08-29)

type TweetPostCardProps = {
  post: Post
  profile?: ProfileWidgetType | null
  feedMedia?: TweetFeedMediaMap | null
}

export function TweetPostCard({
  post,
  feedMedia,
}: TweetPostCardProps) {
  const tags = post.tags?.filter((t) => t.name) ?? []
  const dateLabel = formatTweetDate(post.date?.created)
  const excerpt = post.excerpt?.trim()
  const media = resolveTweetCardMedia(post, feedMedia)
  const lazyBodyCover = isDeferredTweetBodyImage(post.slug, feedMedia)
  const showMedia = media.mode !== 'none' || lazyBodyCover
  const postHref = `/post/${post.slug}`

  return (
    <article className="tweet-post-card">
      <div className="tweet-post-card__shell">
        <PostNavLink href={postHref} navKey={post.slug} className="tweet-post-card__article">
          <div className="tweet-post-card__body">
            <div className="tweet-post-card__title-row">
              <h2 className="tweet-post-card__title">{post.title}</h2>
              {dateLabel ? (
                <time
                  className="tweet-post-card__date"
                  dateTime={post.date?.created}
                >
                  {dateLabel}
                </time>
              ) : null}
            </div>

            {tags.length > 0 ? (
              <div className="tweet-post-card__tags-row">
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="tweet-post-card__tag"
                    style={tweetTagCssVars(tag.name)}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            ) : null}

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
