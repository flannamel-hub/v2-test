import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import type { AnnouncementPopupConfig } from '@/src/lib/blog/announcementPopupDefaults'
import type { PopupAdConfig } from '@/src/lib/blog/popupAdDefaults'
import { AnnouncementPopup } from './AnnouncementPopup'
import { PopupAd } from './PopupAd'

type Props = {
  announcementPopup?: AnnouncementPopupConfig | null
  popupAd?: PopupAdConfig | null
  activeTheme?: string
}

export function SitePopups({
  announcementPopup,
  popupAd,
  activeTheme,
}: Props) {
  const router = useRouter()
  const isHomePage = router.pathname === '/'
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
      <PopupAd
        config={popupAd}
        activeTheme={activeTheme}
        announceSettled={announceSettled}
        isHomePage={isHomePage}
      />
    </>
  )
}
