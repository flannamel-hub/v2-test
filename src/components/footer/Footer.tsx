import CONFIG from '@/blog.config'
import { Title } from '@/src/types/blog'
import { DatabaseObjectResponse } from '@notionhq/client/build/src/api-endpoints'
import Link from 'next/link'
import { BsChevronRight } from 'react-icons/bs'
import { SiNextdotjs, SiNotion, SiTailwindcss, SiVercel } from 'react-icons/si'
import { colorMap } from '../../lib/colors'
import { classNames } from '../../lib/util'
import { ApiColor } from '../../types/notion'
import { Logo } from './Logo'
import ThemeSwitch from './ThemeSwitch'

const Footer = ({
  showBeian = false,
  color,
  title,
  logo,
  path,
}: {
  showBeian?: boolean
  color?: ApiColor | 'pure'
  title?: Title
  logo?: DatabaseObjectResponse['icon']
  path?: {
    text: string
    href: string
  }
}) => {
  const thisYear = new Date().getFullYear()
  const tools = [
    {
      icon: SiNotion,
      url: 'https://developers.notion.com',
    },
    {
      icon: SiNextdotjs,
      url: 'https://nextjs.org',
    },
    {
      icon: SiTailwindcss,
      url: 'https://windicss.org',
    },
    {
      icon: SiVercel,
      url: 'https://vercel.com',
    },
  ]

  return (
    <footer
      className={classNames(
        'relative overflow-hidden',
        color
          ? color === 'pure'
            ? 'bg-white dark:bg-neutral-800'
            : colorMap[(color + '_background_secondary') as ApiColor]
          : 'bg-neutral-100 dark:bg-neutral-800'
      )}
    >
      <div className="flex flex-col px-6 mx-auto items-left lg:w-screen-lg lg:px-11">
        <nav className="flex items-center justify-between py-4">
          {/* 原有的 Logo 和面包屑代码（保持注释状态） */}
          {/* <div className="flex flex-row items-center justify-center gap-1.5">
            <Link href="/">
              <Logo logo={logo} />
            </Link>
            {path && path.text !== '' && (
              <>
                <BsChevronRight
                  className="text-neutral-300 dark:text-neutral-500"
                  size={15}
                />
                <p
                  className="mr-8 text-xs tracking-wide leading-0 text-neutral-300 line-clamp-1 dark:text-neutral-500"
                >
                  {path.text}
                </p>
              </>
            )}
          </div> */}

          {/* 🟢 核心修改区：将 ThemeSwitch 和 Admin 按钮包裹在一起 */}
          <div className="flex items-center gap-3">
            <ThemeSwitch />
            
            {/* 新增：Admin 后台入口按钮 */}
            {/* 使用 a 标签防止 Next.js 预加载触发 Middleware 登录框 */}
            <a 
              href="/admin" 
              target="_blank"
              rel="noopener noreferrer" 
              className="flex items-center justify-center w-6 h-6 rounded-full text-blue-500/30 hover:text-blue-500 hover:bg-blue-500/10 transition-all duration-300 cursor-pointer"
              title="管理后台"
            >
              {/* 齿轮图标 SVG */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </a>
          </div>

        </nav>
        <section className="pt-2 pb-5 overflow-hidden text-neutral-400 dark:text-neutral-500">
          <div className="flex items-end justify-between w-full pb-2 my-2 text-xs  border-footer gap-x-2 dark:border-neutral-700">
            <div className="flex flex-col gap-2 shrink-0">
              <div className="flex items-center">
                <a href='https://proplus.team/' target="_blank" rel="noopener noreferrer" className="hover:text-blue-500 transition-colors">Powered by PRO+</a>
                {/* <div className="inline-flex px-2 py-1 mx-2 space-x-2 rounded-full place-items-center bg-neutral-200 dark:bg-neutral-700">
                  {tools.map((tool) => (
                    <Link
                      key={tool.url}
                      className="leading-0 hover:text-neutral-500 dark:hover:text-white"
                      href={tool.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <tool.icon size={12} />
                    </Link>
                  ))}
                </div> */}
              </div>
              {/* <p className="group">
                Design & Build with{' '}
                <span className="font-serif transition-colors duration-500 ease-in-out group-hover:text-pink-light">
                  ❤
                </span>{' '}
                by{' '}
                <Link
                  className="text-neutral-500 hover:underline dark:text-neutral-400"
                  href="https://github.com/MannyCooper/anzifan.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  MannyCooper
                </Link>
              </p> */}
            </div>
            {/* {CONFIG.PAST_BLOG_INFO && (
              <p className="flex flex-col items-end shrink-0 text-neutral-300 dark:text-neutral-600">
                <a
                  className="hover:underline"
                  href={CONFIG.PAST_BLOG_INFO.URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Past Blog
                </a>
              </p>
            )} */}
          </div>
          {/* <div className="flex justify-between text-xs gap-x-2">
            <span className="shrink-0">
              {`Copyright © ${CONFIG.SITE_START_DATE}-${thisYear} `}
              <Link
                className="text-neutral-500 hover:underline dark:text-neutral-400"
                href={'/me'}
              >
                {title ? title.text : ''}
              </Link>
            </span>
            <Link
              className="truncate shrink-0 text-neutral-500 hover:underline dark:text-neutral-400"
              href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
              target="_blank"
              rel="noopener noreferrer"
            >
              CC BY-NC-SA 4.0
            </Link>
          </div> */}
          {/* {showBeian && <Beian />} */}
        </section>
      </div>
    </footer>
  )
}

const Beian = () => {
  const beian = CONFIG.SITE_BEIAN
  if (!beian) return null

  const { ICP, GONGAN } = beian
  const gonganNumber = GONGAN?.match(/\d+/g)?.join('')

  const beians: { url: string; text: string }[] = []

  if (ICP) {
    beians.push({
      url: 'http://beian.miit.gov.cn/',
      text: ICP,
    })
  }

  if (GONGAN) {
    beians.push({
      url: `http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=${gonganNumber}`,
      text: GONGAN,
    })
  }

  return (
    <p className="mt-2 space-x-1 text-[10px] text-neutral-300 md:space-x-2">
      {beians.map((beian) => (
        <Link
          className="hover:text-neutral-400 hover:underline dark:text-neutral-700"
          href={beian.url}
          rel="noopener noreferrer"
          target="_blank"
          key={beian.text}
        >
          {beian.text}
        </Link>
      ))}
    </p>
  )
}

export default Footer