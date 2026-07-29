# Notion BLOG 项目说明与开发约定

本文档用于记录本项目的结构认知、关键业务逻辑和后续开发约定。后续关键节点的新功能逻辑、规则或约定，应同步补充到本文件。

## 项目定位

- 本项目是基于 Notion 数据库构建的独立 BLOG，前台由 Next.js 13 Pages Router 渲染，数据源以 Notion 为主。
- 项目包含独立可编辑后台，入口为 `/admin`，页面文件是 `src/pages/admin.js`，核心后台组件是 `src/components/blog-manager/AdminDashboard.js`。
- 项目支持接入创作者/商户平台分发：商户系统可通过 JWT 一键进入 Blog 后台；Blog 侧使用 `BLOG_SITE_ID` 绑定商户站点，并用 Supabase 做多租户隔离。
- 除传统文章展示外，项目还支持 Gallery 图库主题、Tweet/MoreThan Log 风格主题、贩售机入口、图库广告、下载信息、文章统计、爬虫入库队列等扩展能力。

## 技术栈与运行方式

- 框架：Next.js 13.0.6、React 18、TypeScript 4.9，仍有部分后台/API 使用 JavaScript。
- 样式：Tailwind CSS、全局样式位于 `src/styles/*`，主题专用样式包括 `gallery-*` 与 `tweet-theme.css`。
- 数据服务：
  - Notion API：文章、页面、导航、Widget、主题配置页等核心内容。
  - Supabase：多租户图库元数据、文章统计、站点设置、主题切换配额、爬虫入库队列等。
  - 兰空图床：后台图片上传与 Gallery 图片文件存储。
- 常用命令：
  - `npm run dev` / `yarn dev`：本地开发。
  - `npm run build` / `yarn build`：生产构建。
  - `npm run lint` / `yarn lint`：Lint。注意 `next.config.js` 当前生产构建忽略 TypeScript 与 ESLint 错误，不能把构建通过等同于类型完全正确。

## 根目录关键文件

- `blog.config.ts`：站点基础配置、Notion 数据库 ID 来源、默认封面、分页数量、特殊页面 slug、评论、Gallery 跳转等。
- `next.config.js`：Next 配置；当前启用 `reactStrictMode`，构建阶段忽略 TS/ESLint 错误，图片 `unoptimized: true`。
- `tailwind.config.ts`：Tailwind 主题、字体和断点；主要断点为 `sm:450px`、`md:734px`、`lg:1068px`。
- `src/middleware.ts`：保护 `/admin` 与 `/api/admin/*`，支持 Basic Auth、`internal_auth` Cookie、JWT `login_token`、迁移期 URL 密码登录。
- `supabase/`：建表脚本和迁移。多租户升级、图库、统计、站点设置、爬虫队列等都在这里维护。
- `docs/`：部署/联调说明，尤其是 `ADMIN_LOGIN_TOKEN.md`、`MULTI_TENANT_SUPABASE.md`、`SUPABASE_GALLERY_SETUP.md`。

## 目录职责

- `src/pages/`：Next Pages Router 页面和 API。
  - `index.tsx`：首页，加载文章列表、Widget、主题专用 feed 数据，并按当前主题选择首页组件。
  - `post/[post].tsx`：文章详情页，按主题渲染标准文章、Gallery 文章或 Tweet 文章。
  - `[page].tsx`：Notion Page 自定义页面；特殊页面 slug 会避开动态页重复生成。
  - `archive/`、`category/`、`tag/`、`friends.tsx`、`download.tsx`：归档、分类、标签、友链和下载说明等页面。
  - `api/admin/*`：后台管理 API，通常由 `AdminDashboard.js` 调用。
- `src/components/`：传统主题和通用 UI 组件。
  - `blog-manager/`：后台管理台核心，`AdminDashboard.js` 是大型客户端组件；`GalleryManager.js` 管理单篇图库；`GalleryStorageBar.js` 显示图库容量。
  - `blocks/`：Notion block 渲染。
  - `layout/`、`nav/`、`footer/`、`section/`、`post/`、`widget/`：传统 Blog 页面结构。
- `src/lib/`：数据访问、格式化、后台辅助和业务逻辑。
  - `notion/`：Notion Client、数据库查询、block 获取、属性读取、过滤器、重试。
  - `blog/`：文章/页面格式化、主题设置、贩售机配置、置顶、首页 Widget、静态路径限制等。
  - `gallery/`：Gallery 图库、多租户 site_id、封面、统计、推荐、下载路径、广告和 Supabase 数据访问。
  - `admin/`：后台上传、图库 flush、全量 redeploy、登录 token、封面设置、编辑器锁定块等辅助逻辑。
  - `ingest/`：爬虫入库队列与 Notion/Gallery 写入逻辑。
  - `seo/`：轻量 SEO 元信息生成。
- `src/themes/`：主题系统。
  - `registry.ts`：主题代号解析与首页组件注册。
  - `themeLayout.tsx`：判断 Gallery/Tweet 是否使用独立壳层。
  - `gallery/`：Gallery 主题页面、图库网格、文章页、下载弹窗、广告、搜索、分类/归档等。
  - `tweet/`：Tweet/MoreThan Log 风格主题及其 light/dark 变体。
  - `anzifan/`、`standard/`：默认/标准文章渲染相关组件。
- `src/types/`：核心类型定义，`blog.ts` 定义 Post/Page/Widget 等前台数据结构，`notion.ts` 定义 Notion API scope 与 block 类型。

## 数据模型与 Notion 约定

- `CONFIG.NOTION_PAGE_ID` 实际来自 `process.env.NOTION_PAGE_ID || process.env.NOTION_DATABASE_ID || ''`，前台和后台应共享同一 Notion 数据库。
- Notion 内容通过 `type` 区分：
  - `Post`：文章。
  - `Page`：导航/自定义页面。
  - `Piece`：片段类内容。
  - `Widget`：首页/主题小组件，包括 `theme-config` 等系统配置页。
- 常用状态包括 `Published`、`Draft`、`Hidden`；代码同时兼容 Notion 的 `status` 属性类型和旧版 `select` 类型。
- 核心字段包括 `title`、`slug`、`excerpt`、`category`、`tags`、`date`、`cover`、`download`、`download_size`、`download_count`、`article_password`、`pinned`、`favourited` 等。部分字段存在大小写或旧字段兼容逻辑，改动时要读 `src/lib/notion/readProperty.ts` 和相关 API 的动态属性判断。
- `slug=theme-config` 的页面用于远程主题配置，通常通过 `excerpt` 存主题代号。
- `theme-config`、`gallery-ad`、`vending`、`announcement-popup` 是系统级 slug，不应作为普通公开自定义页面；`[page].tsx` 会过滤这些 slug，避免系统 Widget 被生成成前台页面。
- 系统保留分类包括 `网站信息`、`系统组件`、`站长通知`、`默认`，后台分类删除/重命名逻辑会保护这些名称。

## 前台渲染流程

- 公共导航与站点信息由 `withNavFooterStaticProps` 注入：读取 Notion 导航缓存，同时解析当前主题和贩售机配置。
- 首页 `src/pages/index.tsx`：
  - 从 Notion 拉取 Archive 范围文章。
  - 用 `formatPosts(..., FORMAT_POST_LIST_OPTIONS)` 格式化，列表场景默认跳过远程封面探测以提升速度。
  - 过滤公告文章 `announcement`，加载首页 Widget。
  - 根据主题额外加载 Gallery feed 封面或 Tweet feed media。
  - 通过 `getThemeHomeComponent` 选择 `anzifan`、`touchgal`、`gallery`、`tweet`、`tweet-light`、`tweet-dark` 首页。
- 文章页 `src/pages/post/[post].tsx`：
  - `getStaticPaths` 默认 `STATIC_POST_PATHS_MAX=0`，走 `fallback: 'blocking'` 按需生成。
  - 单篇通过 slug 精确查询 Notion；失败时回退扫描。
  - Gallery 主题会加载统计、推荐、广告；Tweet 主题会套 `TweetShell`；默认主题走标准文章头、正文、底部导航和评论。
  - 文章受密码保护时由 `ArticlePasswordGate` 处理。
- 自定义页面 `[page].tsx`：
  - 特殊页面 slug（tag/category/archive/friends/about/download 等）不由该动态页重复生成。
  - Tweet 主题使用 `TweetArticlePage`，默认主题使用 `BlockRender`。

## 主题系统

- 主题代号解析位于 `src/themes/registry.ts`：
  - `v1` / `anzifan` / `standard` => `anzifan`
  - `v2` / `touchgal` => `touchgal`
  - `gallery` => `gallery`
  - `tweet` / `morethan-log` / `morethanlog` / `v3` => `tweet`
  - `tweet-light` / `tweet_light` => `tweet-light`
  - `tweet-dark` / `tweet_dark` => `tweet-dark`
- Gallery 与 Tweet 是独立壳层主题，不走默认 Navbar + Footer；判断逻辑在 `usesStandaloneThemeLayout`。
- Tweet 主题视觉调整通常要同时检查 `tweet`、`tweet-light`、`tweet-dark` 三个变体；标签文字和右侧功能按钮颜色由 `src/styles/tweet-theme.css` 中的 `--tweet-tag-*` 与 `--tweet-service-text` 控制。
- 主题读取优先 Supabase `blog_site_settings.theme_code`，再回退 Notion `theme-config`。这样可以避免 Notion filter 延迟导致 ISR 读取旧主题。
- 后台保存 `theme-config` 时会双写 Notion 和 Supabase，并记录主题切换配额。
- 主题切换配额位于 `src/lib/blog/themeSwitchQuota.ts`：24 小时窗口最多 4 次；未配置 Supabase 时通常降级不阻断。

## 后台管理台

- `/admin` 页面通过 `next/dynamic` 加载 `AdminDashboard.js`，禁用 SSR，并用错误边界防止后台崩溃白屏。
- `AdminDashboard.js` 是大型客户端组件，包含文章列表、编辑器、分类标签管理、主题切换、Gallery 管理、友链、广告、贩售机、爬虫入库、全量更新等功能。
- 后台调用的核心 API：
  - `GET /api/admin/posts`：全量分页拉取 Notion 数据库，组装文章/页面/系统配置列表、分类和标签选项；列表封面会结合 Gallery feed cover。
  - `GET/POST/PATCH/DELETE /api/admin/post`：读取、创建、更新、归档 Notion 页面；支持结构化编辑块与 Markdown 转 Notion blocks；支持置顶、收藏、Post/Piece 切换、主题配置保存。
  - `GET/POST /api/admin/gallery`：读取/保存单篇 Gallery 图片元数据到 Supabase。
  - `GET /api/admin/gallery-storage`：读取站点图库容量用量。
  - `POST /api/admin/upload`：服务端代理上传到兰空图床。
  - `GET/POST/DELETE /api/admin/gallery-ad`：Gallery/Tweet 广告条配置。
  - `GET/POST /api/admin/friends`：友链管理；读取/新增/更新 `slug=friends` 页面内部 Friends 子数据库。
  - `POST /api/admin/friends/batch`：批量新增/更新友链，支持 `upsert=true` 按 URL 去重。
  - `POST /api/admin/friends/hide`：按 URL 隐藏友链，优先把子库 `status` 改为 `Hidden`。
  - `GET/POST /api/admin/vending`：贩售机入口配置；底层写入 Notion `slug=vending` 的 Widget。
  - `GET/POST /api/admin/announcement-popup`：公告弹窗配置；底层写入 Notion `slug=announcement-popup` 的 Widget。
  - `POST /api/admin/revalidate`：按路径触发 ISR revalidate。
  - `GET/POST /api/admin/crawler-ingest`：爬虫入库队列处理。
  - `GET/POST /api/admin/full-redeploy`：触发全量 redeploy。
  - `DELETE/PATCH /api/admin/taxonomy`：删除标签/分类或重命名分类。
- 后台编辑器的结构化块会转为 Notion blocks；加密内容使用 `LOCK:<password>` 的 callout 协议，前台和后台都依赖该约定。
- 修改后台时要格外小心：`AdminDashboard.js` 很大，尽量做外科手术式局部修改；能抽到已有小模块的再抽，不要顺手大重构。
- 后台 revalidate 客户端逻辑已从 `AdminDashboard.js` 抽到 `src/components/blog-manager/adminRevalidateClient.js`。后续调整刷新队列、手动刷新、批量刷新、主题切换刷新提示时，优先改这个文件，避免继续扩大 `AdminDashboard.js`。
- 后台保存入队后，`adminRevalidateClient.js` 会安排多次轻量 `action: drain` 兜底消费，避免浏览器标签页节流、网络抖动或 Notion 索引延迟导致前台缓存没有及时刷新。
- 后台“全量更新”按钮保留给管理员维护使用，但 `POST /api/admin/full-redeploy` 需要全量更新密码；默认密码由 `src/lib/admin/maintenancePassword.js` 统一维护，当前兜底为 `123456.`，可后续改为环境变量或更强的服务端配置。
- 后台“爬虫管理”、“全量更新”与“贩售机地址编辑”共用维护密码锁；服务端密码工具位于 `src/lib/admin/maintenancePassword.js`，优先读取 `ADMIN_MAINTENANCE_PASSWORD`，兼容 `ADMIN_FULL_REDEPLOY_PASSWORD`，默认兜底为 `123456.`。
- 后台发布文章时，“尚未添加图片块”提示只在正文没有图片块且当前文章也没有图库图片时弹出；如果已存在图库，则视为已有封面候选，不再打断发布。
- `/admin` 不加载全局 Chatwoot 客服脚本；在线客服仅面向前台访客。
- 后台 Widget 中的 `gallery-ad` 当前作为“内页广告位”维护，数据会用于 Gallery、Tweet 与 Standard 系列文章内页底部 banner；保存后走 `gallery-ad` revalidate 范围刷新文章页。
- 后台 Widget 中的 `vending` 当前作为“贩售机入口”维护，约定：`type=Widget`、`slug=vending`、`title` 为入口按钮文字、`excerpt` 为跳转 URL、`status=Published` 表示开启、`status=Hidden` 表示关闭。旧 Supabase `blog_site_settings.vending_enabled` 仅作为没有该 Widget 时的兼容兜底；后台保存会创建/更新 Notion Widget，并同步旧开关。
- `/api/admin/vending` 的 `POST` 支持 `{ enabled, title, url }`，用于后台和后续商家系统一键替换贩售机地址；修改 `title/url` 必须通过维护密码，单独切换 `enabled` 不需要密码。保存后需要刷新 `vending` 范围（壳层 + 文章页/下载页），`/api/admin/revalidate` 已支持 `scope/listScope='vending'`。
- BLOG 后台贩售机编辑页当前只显示开启/关闭功能，“地址管理”区块通过 `SHOW_VENDING_ADDRESS_ADMIN=false` 隐藏；地址解锁、维护密码校验、标题/URL 编辑和保存逻辑必须保留，后续需要时只切换该显示开关恢复界面。
- Gallery 主题侧栏底部的贩售机按钮固定显示为 `STORE`，只复用 `vending` Widget 的开关和跳转 URL；其他主题仍显示该 Widget 的 `title`。
- `announcement-popup` 当前作为“公告弹窗”系统 Widget 维护，约定：`type=Widget`、`slug=announcement-popup`、`title` 为弹窗标题、`excerpt` 为弹窗正文、`cover` 为可选弹窗图片、`button_text`/`button_url` 为可选按钮文字和链接，`status=Published` 表示开启、`status=Hidden` 表示关闭。`button_text`/`button_url` 字段不存在时服务端会降级忽略，不阻断保存。
- 后台 Widget 列表显示“公告弹窗”入口，用户可自行开启/关闭并编辑标题、正文、图片、按钮文字和链接；同时保留 `/api/admin/announcement-popup` 的 `GET/POST` 供商家系统管理员注入/更新。保存后刷新 `announcement-popup` 范围，`/api/admin/revalidate` 已支持 `scope/listScope='announcement-popup'`。
- `social-links` 当前作为“社交媒体”系统 Widget 维护，约定：`type=Widget`、`slug=social-links`，父级 `status=Published` 表示组件开启；内部子数据库可命名为 `SocialLinks`、`Social Links`、`social-links` 或 `社交媒体`。子库字段约定：`name` 为 title，`platform` 为 select（weibo/twitter/pixiv/telegram/instagram），`status` 为 select/status（Published/Hidden），`url` 为 url 或文本。前台固定渲染五个平台图标，有有效 URL 且 Published 时高亮可点击，否则灰显不可点击；其中 `twitter` 作为兼容数据值继续保留，所有主题前台统一显示最新的 X 图标。
- 后台 Widget 列表中“社媒组件”通过 `GET/POST /api/admin/social-links` 读取/保存 `social-links` Widget 与页内子数据库；用户可开关组件、编辑五个平台 URL、设置显示/隐藏，保存时会自动补齐缺失的平台行，并触发 `social-links` 范围刷新。
- 社媒组件位置：standard/anzifan/touchgal 复用 ProfileWidget 内的原生 `profile.links` 展示；gallery 主题显示在侧栏底部 STORE 按钮下方；tweet/tweet-light/tweet-dark 在右侧 Service 下方显示 Contact 卡片，移动端展开资料面板内也显示。
- 友链数据不在主 Notion 数据库中，而在 `slug=friends` 的 Page 内部 Friends 子数据库中。服务端 helper 位于 `src/lib/admin/friendsNotion.js`，会自动发现该页面和内部子库；字段约定：`name` 为 title、`url` 为 url、`avatar` 为 files external URL、`description` 为可选 rich_text、`status` 为 status/select。
- `/api/admin/friends` 返回 `{ success, friends, source:'notion' }`，单条 POST 支持 `{ id, name, url, avatar, description, status, upsert }`；`upsert=true` 时按 `url` 去重更新。`/api/admin/friends/batch` 支持批量 upsert，`/api/admin/friends/hide` 按 URL 将 `status` 改为 `Hidden`。这些接口不需要维护密码，但仍属于 admin API，不应暴露给前台访客。

## Gallery、下载与统计

- Gallery 图片文件实际存在兰空图床；Supabase 只存图库元数据、缩略图 URL、排序、文件大小和统计。
- 多租户隔离键是 `BLOG_SITE_ID`，对应商户系统 `merchant_services.id`。
- `src/lib/gallery/blogSite.ts` 负责校验 `BLOG_SITE_ID`、判断图库租户是否配置、计算默认容量上限。
- `src/lib/gallery/galleryDb.ts` 的所有图库读写都应带 `site_id` 条件，唯一约束是 `(site_id, post_slug)`。
- Gallery 单篇文章支持前台分页加载图库图片；后台 `GalleryManager.js` 支持上传、拖拽排序、设置封面并保存到 Supabase。
- 下载相关字段包括 `download`、`download_size`、`download_count`；下载页和 Gallery 卡片会使用这些字段展示资源信息。
- 文章浏览/下载统计在 Supabase 中按 `site_id + slug` 记录，相关逻辑在 `src/lib/gallery/postStats.ts`。

## 创作者平台 / 商户分发接入

- 商户平台进入 Blog 后台使用 JWT 登录，协议见 `docs/ADMIN_LOGIN_TOKEN.md`。
- Blog 侧只通过 Vercel 环境变量验签，不读取商户数据库。
- JWT 关键约定：
  - Query 参数为 `login_token`。
  - `iss` 为 `pro-merchant`。
  - `purpose` 为 `admin_login`。
  - `aud` 必须匹配当前 Host。
  - `sub` 必须等于 `AUTH_USER`。
  - 如配置 `BLOG_SITE_ID`，JWT 的 `site_id` 必须一致。
- 验签通过后 middleware 写入 `internal_auth` Cookie，并 302 到不带 token 的 `/admin`。
- 迁移期仍可通过 `?auth_u=&auth_p=` 登录，设置 `DISABLE_LEGACY_URL_PASSWORD=true` 可关闭。

## 环境变量与密钥安全

- 不要打印、暴露、提交 `.env`、API Key、Token 或 service role key。
- 重要环境变量：
  - `NOTION_KEY` / `NOTION_TOKEN`
  - `NOTION_PAGE_ID` / `NOTION_DATABASE_ID`
  - `AUTH_USER` / `AUTH_PASS`
  - `BLOG_LOGIN_JWT_SECRET`
  - `BLOG_SITE_ID`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GALLERY_QUOTA_GB`
  - `LSKY_TOKEN` / `LSKY_URL` / `LSKY_MAX_UPLOAD_MB`
  - `NEXT_REVALIDATE_SECONDS`
  - `DISABLE_LEGACY_URL_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY` 只能在服务端使用；不要放进前端组件或公开响应。
- `NEXT_PUBLIC_SUPABASE_URL` 应是项目根地址，不要带 `/rest/v1`，`normalizeSupabaseUrl` 已做兜底处理。

## 开发约定

- 以项目内本 `AGENTS.md` 为准；新功能的重要逻辑、规则或约定要及时补充。
- 改代码前先读相关目录、依赖和关键文件，理解当前实现后再动手。
- 简单优先：只做用户要求的功能，不加投机性扩展，不顺手重构无关代码。
- 外科手术式修改：只改必须改的文件，匹配现有风格；不要清理或格式化无关文件。
- 保护用户已有修改：工作区可能是脏的，不要回滚自己没改的内容。
- 对 Notion 属性写入要兼容旧/新 schema：例如标题可能是 `title` 或 `Page`，状态可能是 `status` 类型或 `select` 类型，下载字段可能是 `rich_text` 或旧 `url`。
- 对 Supabase 多租户表读写必须带 `site_id`，除非代码明确处理未配置时的降级路径。
- 修改主题配置、图库、统计、贩售机、爬虫队列等站点级状态时，优先检查 `BLOG_SITE_ID` 和 Supabase 配置是否存在。
- 修改前台页面时注意 Gallery/Tweet 独立壳层，不要默认所有页面都走 `BlogLayout`。
- Gallery 卡片封面回退顺序为 Notion 明确封面 → Supabase 图库首图 → Notion 正文第一个图片块；列表构建不批量拉正文 blocks，无前两类封面时由卡片进入视口后复用 `/api/tweet/post-cover/[slug]` 懒加载正文首图，避免大量文章拖慢 ISR。
- Vercel SSG 构建使用 `experimental.cpus=1` 串行生成页面，避免多个静态页同时请求 Notion 触发 429；构建期相同数据库查询会合并，临时 Notion 错误重试耗尽后使用空数据/空 blocks 完成部署，交由后续 ISR 恢复真实内容。空页面 ID 不得请求 Notion blocks。
- 修改后台保存逻辑时注意 revalidate：文章、列表、分类/标签、特殊页面和主题切换都可能需要刷新多个路径。
- 修改图片上传或图库保存时注意 Vercel 请求体限制、兰空 Token、客户端压缩和 Supabase 容量校验。
- ISR/revalidate 已引入 Supabase 队列：普通保存、置顶、回收站等操作优先写入 `blog_revalidate_queue`，按 `site_id + path` 合并，后台延迟触发 `/api/admin/revalidate` 的 `action: drain` 消费；手动刷新 BLOG、主题切换等强一致场景仍可走即时刷新。
- 单篇文章“移入回收站”采用乐观界面：确认后立即从后台已发布列表隐藏，不显示全屏刷新遮罩；Notion 写入失败时恢复原卡片，成功后本地类型改为 `Piece`，壳层与文章路径 revalidate 继续在后台队列完成。Notion 查询索引尚未同步时，后台全量列表刷新不得把该卡片错误恢复为 `Post`。
- 新文章发布是例外：Notion 创建成功后，后台先用乐观数据把文章加入列表，并在列表顶部持续显示“正在更新”提示；同时通过 `/api/admin/posts?syncSlug=&syncId=` 轻量检查数据库查询索引，避免反复全量拉取 500+ 条数据。
- 新 Post 的前台刷新约 60 秒后开始，队列 reason 使用 `new-post:<slug>`。消费前必须确认相关 slug 已被 Notion Published Post 查询索引收录；未收录时不能把任务标记完成，而应约 60 秒后继续重试，最多 8 次。后台保持打开时，索引就绪后会主动执行一次文章范围 revalidate 并结束同步提示；普通编辑仍使用约 30 秒的轻量队列。
- 队列表 SQL 位于 `supabase/migrations/010_revalidate_queue.sql`。未执行该 SQL 或未配置 Supabase/BLOG_SITE_ID 时，`/api/admin/revalidate` 会自动退回旧的即时刷新逻辑，避免前台不更新。
- Notion ISR 读取使用请求作用域缓存与 500ms 请求启动间隔：同一次页面再生中的归档、Widget 和数据库元数据只读取一次，但不跨 ISR 请求缓存文章正文。运行期 Notion 限流时不得把 `PRO BLOG` 等默认站点信息写入页面缓存。

## 验证建议

- 普通前台改动：至少运行 `npm run lint` 或相关类型/构建检查；涉及页面数据时优先本地 `npm run dev` 手动打开对应路由。
- 后台/API 改动：检查 `/admin` 能加载，相关 API 返回结构不破坏 `AdminDashboard.js` 的调用；涉及 Notion 写入时避免使用真实敏感数据做破坏性测试。
- Gallery 改动：验证后台保存图库、前台文章页图库加载、容量条和 `site_id` 隔离逻辑。
- 主题改动：验证 `gallery`、`tweet`、`tweet-light`、`tweet-dark`、默认主题至少不互相破坏；注意 `_app.tsx` 会按主题给 `html` 添加 class。
- 登录/商户分发改动：验证 Basic/Cookie/JWT 三条路径，确认 token 不留在 URL 中。
- ISR/revalidate 改动：检查 `/api/admin/revalidate` 的路径收集范围和冷却逻辑，不要频繁刷新全站。
- Revalidate 队列改动：检查入队返回 `queued: true`、后台是否按 `drainAfterMs` 自动消费，以及 Supabase 表中同一 `site_id + path` 的 pending 任务是否合并。

## 当前已知注意点

- `AdminDashboard.js` 体积很大，局部修改前建议先用 `rg` 定位相关状态、handler 和渲染分支。
- 生产构建配置忽略 TS/ESLint 错误，因此新增代码要自觉保持类型和运行时正确。
- 部分中文注释在某些 Windows 控制台编码下可能显示乱码；编辑文件时应保持 UTF-8。
- `blog.config.ts` 中 `FREINDS` 是已有特殊页面 key 的拼写，除非要做兼容迁移，不要直接改名。
- 默认 `STATIC_POST_PATHS_MAX` 为 0，文章页依赖按需生成；不要误以为所有文章都会在 build 阶段预渲染。
