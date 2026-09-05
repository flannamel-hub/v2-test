/**
 * @type {import('next').NextConfig}
 */

// ---------------------------------------------------------------------------
// 派工单 B4:IndexNow key 文件路由(rewrites 方案)
//
// 目标:GET /{INDEXNOW_KEY}.txt → 200 text/plain,body=key(搜索引擎 IndexNow 验证)。
//
// 与 robots.txt / sitemap.xml 的兼容性(优先级说明,勿删):
// - rewrites() 直接返回数组 = afterFiles 阶段,执行顺序在文件系统路由
//   (pages/*.tsx 页面路由与 public/ 静态文件)之后:
//   · /robots.txt 由 src/pages/robots.txt.tsx 提供真实路由 → 文件系统命中,
//     永远轮不到本 rewrite,不受影响;
//   · /sitemap.xml 同理(src/pages/sitemap.xml.tsx),且 .xml 与 .txt 单段模式不匹配;
//   · /:key.txt 仅捕获「单段、.txt 结尾且无真实文件/页面」的路径,
//     转发 /api/indexnow-key(key 不符或未配置 INDEXNOW_KEY → 404)。
// - 注意:afterFiles 先于动态路由([page].tsx)执行,因此 /foo.txt 这类地址
//   不再落入 Notion 自定义页(对 .txt 单段地址而言这是可接受的语义变更)。
// - 备选 middleware 方案已评估放弃:rewrites 更贴合纯静态 key 语义且不改 middleware 职责。
// ---------------------------------------------------------------------------
const nextConfig = {
  reactStrictMode: true,
  // 忽略各种检查，确保旧代码顺畅通过
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // 给足每个页面的打包超时时间（防中断）
  staticPageGenerationTimeout: 1200,
  trailingSlash: false,

  // Notion 公共 API 容易被 SSG 多页并发触发 429，构建期串行生成更可靠。
  experimental: { cpus: 1 },

  async rewrites() {
    return [
      {
        source: '/:key.txt',
        destination: '/api/indexnow-key?key=:key',
      },
    ];
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    domains: [
      'www.notion.so', 'images.unsplash.com', 'img.notionusercontent.com',
      'file.notion.so', 'static.anzifan.com', 's3.us-west-2.amazonaws.com',
      'img.x1file.top',
    ],
    unoptimized: true,
  }
}
module.exports = nextConfig;
