import { ProfileBioText } from '@/src/components/widget/ProfileBioText'
import { useMemberNavConfig } from '@/src/components/theme/SitePlanContext'
import type { VendingConfig } from '@/src/lib/blog/vendingDefaults'
import { ProfileWidgetType } from '@/src/lib/blog/format/widget/profile'
import { TweetAvatar } from './TweetAvatar'
import { TweetSectionTitle } from './TweetSectionTitle'
import { TweetVendingButton } from './TweetVendingButton'

type TweetProfileCardProps = {
  profile?: ProfileWidgetType | null
  showSectionTitle?: boolean
  vendingConfig?: VendingConfig | null
  vendingEnabled?: boolean
}

export function TweetProfileCard({
  profile,
  showSectionTitle = true,
  vendingConfig,
  vendingEnabled = true,
}: TweetProfileCardProps) {
  const name = profile?.name?.trim() || '本站'
  const description = profile?.description?.trim() || ''
  const showVending = vendingConfig?.enabled ?? vendingEnabled
  // R2-B5a:会员开通时本卡按钮 = 「加入会员」同窗直达 /pricing(internal 模式,
  // 无 data-blog-vending);商品模式行为零变化
  const membershipEnabled = useMemberNavConfig() !== null

  return (
    <div className="tweet-profile">
      {showSectionTitle ? (
        <TweetSectionTitle emoji="🙂" label="站长" desktopOnly />
      ) : null}
      <div className="tweet-profile__stack">
        <div className="tweet-profile-card">
          <div className="tweet-profile-card__top">
            <TweetAvatar
              profile={profile}
              className="tweet-profile-card__avatar-wrap"
              imgClassName="tweet-avatar__img tweet-profile-card__avatar"
              fallbackClassName="tweet-profile-card__avatar-fallback"
              fallbackText={name.charAt(0).toUpperCase()}
            />
          </div>
          <div className="tweet-profile-card__mid">
            <div className="tweet-profile-card__name">{name}</div>
          </div>
          {description ? (
            <ProfileBioText
              text={description}
              className="tweet-profile-card__bio"
            />
          ) : null}
        </div>
        {membershipEnabled ? (
          <TweetVendingButton internal url="/pricing" title="加入会员" />
        ) : showVending ? (
          <TweetVendingButton url={vendingConfig?.url} title={vendingConfig?.title} />
        ) : null}
      </div>
    </div>
  )
}
