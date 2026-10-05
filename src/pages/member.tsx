import type { GetStaticProps, NextPage } from 'next'

/**
 * 站点会员 R2-B5a:/member 页退役。
 * - 任何状态(开通/未开通/guest/active)一律重定向 /pricing(permanent:false,实返 307);
 * - 裸 getStaticProps 直接返回 redirect(Q4:绕开 withNavFooterStaticProps,
 *   省掉每次 ISR 的 Notion 拉取;组件本体不再渲染任何内容);
 * - MemberCenter.tsx 文件保留(tests 依赖纯函数导出),已标注 deprecated 勿新引用;
 * - contentRevalidation 的 /member 路径项保留(重定向响应亦受益)。
 */
const MemberRedirectPage: NextPage = () => null

export const getStaticProps: GetStaticProps = async () => {
  return {
    redirect: { destination: '/pricing', permanent: false },
    revalidate: 3600,
  }
}

export default MemberRedirectPage
