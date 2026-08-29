import CONFIG from '@/blog.config'
import Link from 'next/link'
import {
  AiOutlineDownload,
  AiOutlineInfoCircle,
  AiOutlineLink,
  AiOutlineQuestionCircle,
} from 'react-icons/ai'
import { TweetSectionTitle } from './TweetSectionTitle'

const { ABOUT, FREINDS } = CONFIG.DEFAULT_SPECIAL_PAGES

type TweetServiceCardProps = {
  showSectionTitle?: boolean
  sectionTitleDesktopOnly?: boolean
}

export function TweetServiceCard({
  showSectionTitle = true,
  sectionTitleDesktopOnly = true,
}: TweetServiceCardProps) {
  return (
    <div className="tweet-service">
      {showSectionTitle ? (
        <TweetSectionTitle
          emoji="👋"
          label="访客"
          desktopOnly={sectionTitleDesktopOnly}
        />
      ) : null}
      <div className="tweet-service__card">
        <Link href="/announcement" className="tweet-service__link">
          <AiOutlineQuestionCircle className="tweet-service__icon" aria-hidden />
          <span className="tweet-service__name">站长说明</span>
        </Link>
        <Link href="/download" className="tweet-service__link">
          <AiOutlineDownload className="tweet-service__icon" aria-hidden />
          <span className="tweet-service__name">下载说明</span>
        </Link>
        <Link href={`/${ABOUT}`} className="tweet-service__link">
          <AiOutlineInfoCircle className="tweet-service__icon" aria-hidden />
          <span className="tweet-service__name">关于本站</span>
        </Link>
        <Link href={`/${FREINDS}`} className="tweet-service__link">
          <AiOutlineLink className="tweet-service__icon" aria-hidden />
          <span className="tweet-service__name">更多内容</span>
        </Link>
      </div>
    </div>
  )
}
