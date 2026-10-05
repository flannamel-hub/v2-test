import type { GetServerSideProps, NextPage } from 'next'

/**
 * 站点会员 R2-B5a:/member 页退役。
 * - 任何状态(开通/未开通/guest/active)一律重定向 /pricing(permanent:false,实返 307);
 * - 裸 getServerSideProps 直接返回 redirect(按请求运行时重定向,不再参与预渲染,
 *   规避 Next 13.0.6 预渲染期 "redirect can not be returned from getStaticProps" 构建阻断;
 *   行为不变仍 307 → /pricing;gssp 无 revalidate 字段,故去除;
 *   组件本体不再渲染任何内容);
 * - MemberCenter.tsx 文件保留(tests 依赖纯函数导出),已标注 deprecated 勿新引用;
 * - contentRevalidation 的 /member 路径项保留(重定向响应亦受益)。
 */
const MemberRedirectPage: NextPage = () => null

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/pricing', permanent: false },
})

export default MemberRedirectPage
