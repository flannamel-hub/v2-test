'use client'

import { useState } from 'react'
import { ProfileBioText } from '@/src/components/widget/ProfileBioText'
import { MemberNav } from '@/src/components/member/MemberNav'
import type { VendingConfig } from '@/src/lib/blog/vendingDefaults'
import { ProfileWidgetType } from '@/src/lib/blog/format/widget/profile'
import { TweetAsideFooter } from './TweetAsideFooter'
import { TweetAvatar } from './TweetAvatar'
import { TweetContactCard } from './TweetContactCard'
import { TweetServiceCard } from './TweetServiceCard'
import { TweetVendingButton } from './TweetVendingButton'

export function TweetMobileProfileCard({
  profile,
  vendingConfig,
  vendingEnabled = true,
}: {
  profile?: ProfileWidgetType | null
  vendingConfig?: VendingConfig | null
  vendingEnabled?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const name = profile?.name?.trim() || '本站'
  const description = profile?.description?.trim() || ''
  const showVending = vendingConfig?.enabled ?? vendingEnabled

  return (
    <div className="tweet-feed__profile-mobile">
      <div className="tweet-profile__stack tweet-profile__stack--mobile">
        <button
          type="button"
          className="tweet-profile-mobile tweet-profile-mobile--toggle"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-label={expanded ? '收起站点菜单' : '展开站点菜单'}
        >
          <div className="tweet-profile-mobile__row">
            <TweetAvatar
              profile={profile}
              className="tweet-profile-mobile__avatar-wrap"
              imgClassName="tweet-avatar__img tweet-profile-mobile__avatar"
              fallbackClassName="tweet-profile-mobile__avatar tweet-profile-mobile__avatar-fallback"
              fallbackText={name.charAt(0).toUpperCase()}
            />
            <div className="tweet-profile-mobile__text">
              <div className="tweet-profile-mobile__name">{name}</div>
              {description ? (
                <ProfileBioText
                  text={description}
                  className="tweet-profile-mobile__bio"
                />
              ) : null}
            </div>
            <span
              className={`tweet-profile-mobile__chevron${expanded ? ' is-open' : ''}`}
              aria-hidden
            />
          </div>
        </button>

        {expanded ? (
          <div className="tweet-mobile-profile-panel">
            {/* 站点会员 R2-B5a:移动端展开面板登录位/chip(<1024px 可见) */}
            <MemberNav variant="tweet-mobile" />
            {showVending ? (
              <TweetVendingButton url={vendingConfig?.url} title={vendingConfig?.title} />
            ) : null}
            <TweetServiceCard />
            <TweetContactCard profile={profile} />
            <TweetAsideFooter />
          </div>
        ) : null}
      </div>
    </div>
  )
}
