import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import type { AnnouncementPopupConfig } from '@/src/lib/blog/announcementPopupDefaults'
import type { ClickAdConfig } from '@/src/lib/blog/clickAdDefaults'
import type { PopupAdConfig } from '@/src/lib/blog/popupAdDefaults'
import { useSitePlan } from '@/src/components/theme/SitePlanContext'
import { announcementSessionKey, AnnouncementPopup } from './AnnouncementPopup'
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
  // 公告结清状态按「内容 key」结算:记录已结清的 key,与当前 key 一致即结清。
  // - 修复 P1(复位竞态):不再用挂载期 reset effect(子组件同批次 onSettled
  //   会被父组件复位覆盖,导致本会话已关公告后广告被永久压死);
  // - 修复 P2(无关重渲染):activeTheme 等无关变化不触碰结清状态,已可见的
  //   广告不再被隐藏;
  // - 公告内容变化(→新 key)自然回到未结清,广告重新等待,保证互斥。
  const announcementKey = useMemo(
    () => announcementSessionKey(announcementPopup),
    [announcementPopup]
  )
  const announcementKeyRef = useRef(announcementKey)
  announcementKeyRef.current = announcementKey
  const [settledAnnouncementKey, setSettledAnnouncementKey] = useState<string | null>(null)
  const announceSettled = settledAnnouncementKey === announcementKey
  const handleAnnounceSettled = useCallback(() => {
    setSettledAnnouncementKey(announcementKeyRef.current)
  }, [])

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
