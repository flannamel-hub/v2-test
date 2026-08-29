import { PostNavLink } from '@/src/components/navigation/PostNavStallGuard'
import { ProfileWidgetType } from '@/src/lib/blog/format/widget/profile'
import { TweetFeedMediaMap } from '@/src/lib/tweet/loadTweetFeedMedia'
import { Post } from '@/src/types/blog'
import { formatTweetDate } from './tweetSearch'
import { TweetPostCardAuthor } from './TweetPostCardAuthor'
import { TweetPostCardCoverLazy } from './TweetPostCardCoverLazy'
import { TweetPostCardMedia } from './TweetPostCardMedia'
import {
  isDeferredTweetBodyImage,
  resolveTweetCardMedia,
} from './tweetFeedMedia'
import { tweetTagCssVars } from './tweetTagColor'

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
  const categoryName = post.category?.name?.trim()
  const categoryId = post.category?.id
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
        <TweetPostCardAuthor
          profile={profile}
          categoryName={categoryName}
          categoryId={categoryId}
          dateLabel={dateLabel}
          dateTime={post.date?.created}
          slug={post.slug}
        />
        <PostNavLink href={postHref} navKey={post.slug} className="tweet-post-card__article">
          <div className="tweet-post-card__body">
            <h2 className="tweet-post-card__title">{post.title}</h2>

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

            {tags.length > 0 ? (
              <div className="tweet-post-card__tags">
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
