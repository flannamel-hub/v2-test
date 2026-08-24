import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import type { AnnouncementPopupConfig } from '@/src/lib/blog/announcementPopupDefaults'
import type { ClickAdConfig } from '@/src/lib/blog/clickAdDefaults'
import type { PopupAdConfig } from '@/src/lib/blog/popupAdDefaults'
import { useSitePlan } from '@/src/components/theme/SitePlanContext'
import { AnnouncementPopup } from './AnnouncementPopup'
import { ClickAdCapture } from './ClickAdCapture'
import { PopupAd } from './PopupAd'

type Props = {
  announcementPopup?: AnnouncementPopupConfig | null
  popupAd?: PopupAdConfig | null
  clickAd?: ClickAdConfig | null
  activeTheme?: string
}

export function SitePopups({
  announcementPopup,
  popupAd,
  clickAd,
  activeTheme,
}: Props) {
  const router = useRouter()
  const isHomePage = router.pathname === '/'
  // BLOG 分层 P4-FIX:广告位(popup-ad/click-ad)为专业版权益;
  // 免费版一律不渲染(即使旧 ISR 缓存 props 里仍带存量配置)。
  // 公告弹窗是站务通知,不属于广告位,所有套餐照常。
  const adsAllowed = useSitePlan() === 'pro'
  const [announceSettled, setAnnounceSettled] = useState(false)
  const handleAnnounceSettled = useCallback(() => {
    setAnnounceSettled(true)
  }, [])

  useEffect(() => {
    setAnnounceSettled(false)
  }, [announcementPopup, activeTheme])

  return (
    <>
      <AnnouncementPopup
        config={announcementPopup}
        activeTheme={activeTheme}
        onSettled={handleAnnounceSettled}
      />
      {adsAllowed ? (
        <PopupAd
          config={popupAd}
          activeTheme={activeTheme}
          announceSettled={announceSettled}
          isHomePage={isHomePage}
        />
      ) : null}
      {adsAllowed ? <ClickAdCapture config={clickAd} isHomePage={isHomePage} /> : null}
    </>
  )
}
