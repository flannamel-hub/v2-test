import CONFIG from '@/blog.config'
import { GetStaticProps, GetStaticPropsContext, NextPage } from 'next'
import Head from 'next/head'
import { BlogLayoutPure } from '../components/layout/BlogLayout'
import ContainerLayout from '../components/post/ContainerLayout'
import { LargeTitle } from '../components/LargeTitle'
import { MemberCenter } from '../components/member/MemberCenter'
import withNavFooter from '../components/withNavFooter'
import { getEffectiveMembershipConfig } from '../lib/blog/membershipGate'
import { withNavFooterStaticProps } from '../lib/blog/withNavFooterStaticProps'
import { applyThemePageLayout } from '@/src/themes/themeLayout'
import { NextPageWithLayout, SharedNavFooterStaticProps } from '../types/blog'
import type { SiteMembershipConfig } from '../lib/blog/membershipGate'

/**
 * 站点会员 B1/B4:/member 会员中心。
 * - 未开通站点 notFound(零可见);开通后由平台 revalidate / TTL 自愈
 *   (B4-W7:/member 已纳入 collectShellRevalidatePaths);
 * - 三态 UI(active/expired/guest)在 MemberCenter(B4-W3 实装);
 * - 壳层走 [page].tsx 通用路径(withNavFooter/ThemeNavShell 自动处理 gallery/tweet/shop)。
 */
const MemberPage: NextPage<{
  membershipConfig?: SiteMembershipConfig | null
}> = ({ membershipConfig }) => {
  return (
    <>
      <Head>
        {/* 会员中心不进搜索引擎 */}
        <meta name="robots" content="noindex" />
      </Head>
      <ContainerLayout>
        <LargeTitle className="mb-4" title="会员" />
        {membershipConfig ? (
          <MemberCenter config={membershipConfig} />
        ) : null}
      </ContainerLayout>
    </>
  )
}

export const getStaticProps: GetStaticProps = withNavFooterStaticProps(
  async (
    _context: GetStaticPropsContext,
    sharedPageStaticProps: SharedNavFooterStaticProps
  ): Promise<SharedNavFooterStaticProps> => {
    const config = await getEffectiveMembershipConfig()
    if (!config) {
      // 强「零可见」:未开通(或免费版)直接 404
      return {
        notFound: true,
        revalidate: CONFIG.NEXT_REVALIDATE_SECONDS,
      } as unknown as SharedNavFooterStaticProps
    }
    // membershipConfig 已在 shared props(双门收敛),透传即可
    return {
      props: JSON.parse(JSON.stringify({ ...sharedPageStaticProps.props })),
      revalidate: CONFIG.NEXT_REVALIDATE_SECONDS,
    } as SharedNavFooterStaticProps
  }
)

;(MemberPage as NextPageWithLayout).getLayout = (page) =>
  applyThemePageLayout(page, (p) => <BlogLayoutPure>{p}</BlogLayoutPure>)

export default withNavFooter(MemberPage)
