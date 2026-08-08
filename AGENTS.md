# Notion BLOG 项目说明与开发约定

本文档用于记录本项目的结构认知、关键业务逻辑和后续开发约定。  
后续关键节点的新功能逻辑、规则或约定，应同步补充到本文件。

---

## 1. 项目定位

- 本项目是基于 Notion 数据库构建的独立 BLOG，前台由 Next.js 13 Pages Router 渲染，数据源以 Notion 为主。
- 项目包含独立可编辑后台，入口为 `/admin`，页面文件是 `src/pages/admin.js`，核心后台组件是 `src/components/blog-manager/AdminDashboard.js`。
- 项目支持接入创作者/商户平台分发：商户系统可通过 JWT 一键进入 Blog 后台；Blog 侧使用 `BLOG_SITE_ID` 绑定商户站点，并用 Supabase 做多租户隔离。
- 除传统文章展示外，项目还支持 Gallery 图库主题、Tweet/MoreThan Log 风格主题、贩售机入口、图库广告、下载信息、文章统计、爬虫入库队列、公告弹窗、社媒组件等扩展能力。

---

## 2. 技术栈与运行方式

- 框架：Next.js 13.0.6、React 18、TypeScript 4.9；仍有部分后台/API 使用 JavaScript。
- 包管理：`packageManager` 声明为 `yarn@1.22.22`；`npm` / `yarn` 命令均可。
- 样式：Tailwind CSS；全局样式位于 `src/styles/*`；主题专用样式包括 `gallery-*` 与 `tweet-theme.css`。
- 数据服务：
  - Notion API：文章、页面、导航、Widget、主题配置页等核心内容。
  - Supabase：多租户图库元数据、文章统计、站点设置、主题切换配额、爬虫入库队列、ISR revalidate 队列等。
  - 兰空图床：后台图片上传与 Gallery 图片文件存储。
- 常用命令：
  - `npm run dev` / `yarn dev`：本地开发。
  - `npm run build` / `yarn build`：生产构建。
  - `npm run lint` / `yarn lint`：Lint。
- 注意：`next.config.js` 当前生产构建忽略 TypeScript 与 ESLint 错误（`ignoreBuildErrors` / `ignoreDuringBuilds`），不能把构建通过等同于类型完全正确。
- 部署相关 Next 配置：
  - `staticPageGenerationTimeout: 1200`
  - `experimental.cpus: 1`（构建期串行生成，降低 Notion 429）
  - `images.unoptimized: true`

---

## 3. 根目录关键文件

| 文件/目录 | 作用 |
|-----------|------|
| `blog.config.ts` | 站点基础配置、Notion 数据库 ID 来源、默认封面、分页数量、特殊页面 slug、评论、Gallery 跳转等 |
| `next.config.js` | Next 配置；构建忽略 TS/ESLint；图片域名与 `unoptimized` |
| `tailwind.config.ts` | Tailwind 主题、字体和断点；主要断点 `sm:450px`、`md:734px`、`lg:1068px` |
| `vercel.json` | Vercel Cron：每日 UTC 19:00（约北京 03:00）触发爬虫自动入库 |
| `src/middleware.ts` | 保护 `/admin` 与 `/api/admin/*` |
| `supabase/` | 建表脚本、迁移、RUNBOOK |
| `docs/` | 部署/联调说明，尤其 `ADMIN_LOGIN_TOKEN.md`、`MULTI_TENANT_SUPABASE.md`、`SUPABASE_GALLERY_SETUP.md` |
| `.env.example` | 可提交的环境变量模板 |

### `blog.config.ts` 关键字段

- `NOTION_PAGE_ID`：`process.env.NOTION_PAGE_ID || process.env.NOTION_DATABASE_ID || ''`
- `NEXT_REVALIDATE_SECONDS`：默认 `3600`
- `HOME_POSTS_COUNT`：首页各尺寸卡片数量
- `ARCHIVE_PER_COUNT`：归档分页，默认 `10`
- `STATIC_POST_PATHS_MAX`：默认 `0`（文章页不预渲染，靠 `fallback: 'blocking'`）
- `DEFAULT_SPECIAL_PAGES`：`tag` / `category` / `archive` / `friends`（key 拼写为 `FREINDS`）/ `about` / `download`
- `ENABLE_COMMENT`：当前为 `false`
- `ENABLE_DRAFT_DIALOG`：草稿提示开关
- `GALLERY_LOGIN_URL` / `GALLERY_GUIDE_PATH` / `GALLERY_MORE_PATH`：Gallery 侧栏跳转

---

## 4. 目录职责

### `src/pages/`

- `index.tsx`：首页；加载文章列表、Widget、主题专用 feed，并按主题选择首页组件。
- `post/[post].tsx`：文章详情；按主题渲染标准 / Gallery / Tweet 文章。
- `post/[post]/download.tsx`：文章下载相关页。
- `[page].tsx`：Notion Page 自定义页面；特殊/系统 slug 会避开重复生成。
- `archive/`、`category/`、`tag/`、`friends.tsx`、`download.tsx`、`about.tsx`：归档、分类、标签、友链、下载说明、关于页。
- `admin.js`：后台入口（dynamic 加载 `AdminDashboard`，禁用 SSR）。
- `api/admin/*`：后台管理 API。
- `api/*`（非 admin）：公开或密钥保护的前台/运维 API。

### `src/components/`

- `blog-manager/`：后台核心。`AdminDashboard.js` 是大型客户端组件；`GalleryManager.js` 管理单篇图库；`GalleryStorageBar.js` 显示容量；`adminRevalidateClient.js` 负责客户端 revalidate/drain。
- `blocks/`：Notion block 渲染（含 `EncryptedCallout` 加密块）。
- `layout/`、`nav/`、`footer/`、`section/`、`post/`、`widget/`：传统 Blog 页面结构。
- `comments/`：Twikoo / Giscus 评论。

### `src/lib/`

- `notion/`：Notion Client、数据库查询、block 获取、属性读取、过滤器、重试、请求作用域缓存。
- `blog/`：文章/页面格式化、主题设置、贩售机、公告弹窗、置顶/收藏、首页 Widget、静态路径限制、revalidate 队列、主题切换配额等。
- `gallery/`：图库、多租户 `site_id`、封面、统计、推荐、下载路径、广告、Supabase 访问、feed 预览。
- `admin/`：上传、图库 flush、正文媒体 flush、全量 redeploy、登录 token、封面设置、编辑器锁定块、友链/社媒 Notion helper、维护密码等。
- `ingest/`：爬虫入库队列与 Notion/Gallery 写入。
- `tweet/`：Tweet feed media 加载。
- `seo/`：轻量 SEO 元信息。
- `supabase/`：服务端 Supabase admin client。

### `src/themes/`

- `registry.ts`：主题代号解析与首页组件注册。
- `themeLayout.tsx`：判断 Gallery/Tweet 是否使用独立壳层。
- `gallery/`：Gallery 主题页面、图库网格、文章页、下载弹窗、广告、搜索、分类/归档等。
- `tweet/`：Tweet/MoreThan Log 风格及其 light/dark 变体。
- `anzifan/`、`standard/`：默认/标准文章渲染相关组件。

### `src/types/`

- `blog.ts`：Post / Page / Widget 等前台数据结构。
- `notion.ts`：Notion API scope 与 block 类型。

---

## 5. 数据模型与 Notion 约定

### 内容类型（`type`）

| type | 含义 |
|------|------|
| `Post` | 已发布/可展示的文章 |
| `Page` | 导航/自定义页面 |
| `Piece` | 片段/回收站类内容（移入回收站后常改为 Piece） |
| `Widget` | 首页/系统小组件（含 theme-config 等） |

### 状态

- 常用：`Published`、`Draft`、`Hidden`
- 代码同时兼容 Notion `status` 属性类型和旧版 `select` 类型

### 核心字段

- `title`、`slug`、`excerpt`、`category`、`tags`、`date`、`cover`
- `download`、`download_size`、`download_count`
- `article_password`、`pinned`、`favourited`
- 部分字段存在大小写或旧字段兼容逻辑；改动时先读 `src/lib/notion/readProperty.ts` 和相关 API 的动态属性判断

### 系统级 slug / Widget（勿当作普通公开页）

| slug | 用途 | 主要约定 |
|------|------|----------|
| `theme-config` | 远程主题配置 | 通常用 `excerpt` 存主题代号；保存时双写 Notion + Supabase |
| `gallery-ad` | 内页广告位 | `status` Published=开 / Hidden=关；全主题文章内页底部横幅；Gallery 下载页也会显示 |
| `vending` | 贩售机入口 | `title`=按钮文字，`excerpt`=URL，`Published`=开 / `Hidden`=关 |
| `announcement-popup` | 公告弹窗（通知） | `title`/`excerpt`/`cover`；**无跳转按钮**；旧 `button_text`/`button_url` 保存时清空，字段不存在则忽略 |
| `popup-ad` | 弹窗广告 | `title`/`excerpt`/`cover`/`button_text`/`button_url`；`Published`=开；**仅首页**；`sessionStorage` 每会话一次；与公告同时开时先公告后广告 |
| `social-links` | 社交媒体 | 父级 `status` 控制开关；内嵌 SocialLinks 子数据库 |

预留未实现（仍用 Notion 系统 Widget，勿当已上线）：

| slug | 规划 | 产品规则 |
|------|------|----------|
| `click-ad` | 遮罩广告（P2） | 仅首页；`localStorage` 每天一次；排除贩售机；原点击仍有效 + 新标签打开广告链接 |

`[page].tsx` 会过滤：

- `CONFIG.DEFAULT_SPECIAL_PAGES` 全部值：`tag`、`category`、`archive`、`friends`、`about`、`download`
- 以及：`theme-config`、`gallery-ad`、`vending`、`announcement-popup`、`popup-ad`、`social-links`

新建文章保留 slug（`RESERVED_POST_SLUGS`）：

- `announcement`、`about`、`download`、`theme-config`、`gallery-ad`、`vending`、`announcement-popup`、`popup-ad`、`social-links`

注意：后台 `AdminDashboard.js` 内 `SPECIAL_PAGE_SLUGS` 列表更短（主要用于列表分类），与上述两处不完全一致；改 slug 保留规则时建议三处一起核对。

### 其他 Notion 约定

- `announcement`：公告**文章** slug（不是系统 Widget）；首页会过滤，不进普通文章流。
- 系统保留分类：`网站信息`、`系统组件`、`站长通知`、`默认`；后台分类删除/重命名会保护这些名称。
- 友链不在主库，而在 `slug=friends` 的 Page 内部 Friends 子数据库（见第 8 节）。
- 社媒不在主库行内字段完成，而在 `slug=social-links` 的 Widget 内部子数据库。

---

## 6. 前台渲染流程

### 公共注入

- `withNavFooterStaticProps` 注入导航与站点信息：读取 Notion 导航缓存，同时解析当前主题和贩售机配置。
- Gallery / Tweet 使用独立壳层，不走默认 Navbar + Footer（`usesStandaloneThemeLayout`）。

### 首页 `src/pages/index.tsx`

1. 从 Notion 拉取 Archive 范围文章。
2. 用 `formatPosts(..., FORMAT_POST_LIST_OPTIONS)` 格式化；列表场景默认跳过远程封面探测以提升速度。
3. 过滤公告文章 `announcement`，加载首页 Widget。
4. 按主题额外加载 Gallery feed 封面或 Tweet feed media。
5. 通过 `getThemeHomeComponent` 选择首页：`anzifan`、`touchgal`、`gallery`、`tweet`、`tweet-light`、`tweet-dark`。

### 文章页 `src/pages/post/[post].tsx`

1. `getStaticPaths` 默认 `STATIC_POST_PATHS_MAX=0`，`fallback: 'blocking'` 按需生成。
2. 单篇先按 slug 精确查 Notion；失败再回退扫描。
3. Gallery：加载统计、推荐、广告等。
4. Tweet：套 `TweetShell`。
5. 默认主题：标准文章头、正文、底部导航、评论（评论总开关当前关闭）。
6. 全篇密码保护由 `ArticlePasswordGate` 处理（见第 11 节）。

### 自定义页 `[page].tsx`

- 特殊页面与系统 Widget slug 不由此动态页重复生成。
- Tweet 主题用 `TweetArticlePage`，默认主题用 `BlockRender`。

### Gallery 封面回退顺序

1. Notion 明确封面  
2. Supabase 图库首图  
3. Notion 正文第一个图片块（列表构建不批量拉 blocks；无前两类封面时，卡片进入视口后复用 `/api/tweet/post-cover/[slug]` 懒加载）

---

## 7. 主题系统

### 代号解析（`src/themes/registry.ts`）

| 输入代号 | 归一化结果 |
|----------|------------|
| `v1` / `anzifan` / `standard` | `anzifan` |
| `v2` / `touchgal` | `touchgal` |
| `gallery` | `gallery` |
| `tweet` / `morethan-log` / `morethanlog` / `v3` | `tweet` |
| `tweet-light` / `tweet_light` | `tweet-light` |
| `tweet-dark` / `tweet_dark` | `tweet-dark` |

### 读取与保存

- 读取优先 Supabase `blog_site_settings.theme_code`，再回退 Notion `theme-config`，避免 Notion filter 延迟导致 ISR 读到旧主题。
- 后台保存 `theme-config` 时双写 Notion 和 Supabase，并记录主题切换配额。
- 配额实现：`src/lib/blog/themeSwitchQuota.ts`，24 小时窗口最多 4 次；未配置 Supabase/`BLOG_SITE_ID` 时通常降级不阻断。
- 后台查询配额接口名为 `/api/admin/theme-cooldown`（历史命名），实际语义是配额状态，不是旧的 Gallery cooldown。
- migration `008_gallery_theme_cooldown.sql` 的字段当前代码已不再使用，以 009 配额为准。

### 视觉注意

- Tweet 视觉调整通常要同时检查 `tweet`、`tweet-light`、`tweet-dark`。
- 标签文字和右侧功能按钮颜色由 `src/styles/tweet-theme.css` 中的 `--tweet-tag-*` 与 `--tweet-service-text` 控制。
- `_app.tsx` 会按主题给 `html` 添加 class；Gallery/Tweet 有独立 loading/字体逻辑。

### 贩售机显示差异

- Gallery 主题侧栏底部贩售机按钮固定显示为 `STORE`，只复用 `vending` 的开关和 URL。
- 其他主题仍显示 Widget 的 `title`。

### 社媒组件位置

- standard / anzifan / touchgal：复用 ProfileWidget 内的 `profile.links`。
- gallery：侧栏底部 STORE 按钮下方。
- tweet 系列：右侧 Service 下方 Contact 卡片；移动端展开资料面板内也显示。
- 前台固定五个平台：weibo / twitter(X) / pixiv / telegram / instagram；`twitter` 数据值兼容保留，图标统一为 X。

---

## 8. 后台管理台

### 入口与结构

- `/admin` 通过 `next/dynamic` 加载 `AdminDashboard.js`，禁用 SSR，并用错误边界防止白屏。
- `AdminDashboard.js` 体积很大：文章列表、编辑器、分类标签、主题切换、Gallery、友链、广告、贩售机、公告弹窗、社媒、爬虫入库、全量更新等都在其中。
- 修改后台时做外科手术式局部修改；revalidate 客户端逻辑优先改 `adminRevalidateClient.js`，避免继续扩大 `AdminDashboard.js`。
- `/admin` 不加载 Chatwoot；且 `_app.tsx` 中 `CHATWOOT_ENABLED` 当前硬编码为 `false`（整站关闭）。

### 列表 Tab 与广告位分类

- 后台列表 Tab 顺序：`已发布` / `已收藏` / `组件` / `广告位` / `自定义页面`（内部代号含 `Ads`）。
- **组件**：友链、社媒、贩售机、**公告弹窗**、网站信息（硬编码卡片；Notion 普通 Widget 行不列出）。
- **广告位**：**内页广告位**（`gallery-ad`）、**弹窗广告**（`popup-ad`）；后续 P2 `click-ad` 也放此 Tab。
- `Widget` 与 `Ads` 的 `getFilteredPosts` 均清空 Notion 行，只渲染硬编码入口。

### 公告弹窗与广告位约定

- `announcement-popup` 定位为**站务通知**，不是广告：前台无 CTA 跳转按钮，无「通知」类标签；布局为标题栏 + 正文/可选附图 + 底部全宽「知道了」；正文内 URL 自动链接触可保留。
- 前台浅色：`gallery`、`tweet-light`、standard 的 `html:not(.dark)`；深色：`tweet`、`tweet-dark`、standard 的 `html.dark`。
- 关闭后用 `sessionStorage` + 内容 hash，同会话同内容不再弹；内容变更后会再弹。
- `gallery-ad` 后台有开启/关闭开关（Notion `status`）；关闭后前台不渲染。文章页全主题生效（`GalleryAdBanner` / `TweetAdBanner` / `StandardAdBanner`）；下载页广告目前仅 Gallery。
- `popup-ad` 为营销弹窗：主图 + 标题 + 文案 + CTA；**仅首页**进入时弹出；`sessionStorage` 键 `popup-ad:session-shown` 每浏览器会话一次；与公告同时开启时由 `SitePopups` 先公告、关闭后再弹广告。
- 公告弹窗深色适配：standard / tweet-dark 为纯黑面板；tweet（灰色）为灰阶深色；浅色主题（gallery / tweet-light / standard light）保持白底。
- 前台挂载：`withNavFooter` → `SitePopups`（公告 + 弹窗广告）。

### 后台核心 API

| 接口 | 作用 |
|------|------|
| `GET /api/admin/posts` | 全量分页拉 Notion；组装文章/页面/系统配置、分类标签；封面结合 Gallery feed；支持 `syncSlug`/`syncId` 轻量索引检查 |
| `GET/POST/PATCH/DELETE /api/admin/post` | 读/建/改/归档；结构化块与 Markdown 转 blocks；置顶、收藏、Post/Piece、主题配置保存 |
| `GET/POST /api/admin/gallery` | 单篇图库元数据读写（Supabase） |
| `GET /api/admin/gallery-storage` | 站点图库容量 |
| `POST /api/admin/upload` | 服务端代理上传到兰空 |
| `GET/POST/DELETE /api/admin/gallery-ad` | 内页广告条（后台在「广告位」Tab；支持 enabled 开关） |
| `GET/POST /api/admin/friends` | 友链读写（friends 子库） |
| `POST /api/admin/friends/batch` | 批量 upsert，可按 URL 去重 |
| `POST /api/admin/friends/hide` | 按 URL 隐藏（优先 `status=Hidden`） |
| `GET/POST /api/admin/vending` | 贩售机配置 |
| `GET/POST /api/admin/announcement-popup` | 公告通知弹窗配置（无跳转按钮；保存清空旧 button 字段） |
| `GET/POST /api/admin/popup-ad` | 首页弹窗广告配置（CTA 必填链接；会话一次） |
| `GET/POST /api/admin/social-links` | 社媒组件配置 |
| `GET /api/admin/theme-cooldown` | 主题切换配额状态（命名历史遗留） |
| `POST /api/admin/revalidate` | ISR 刷新；支持即时刷新与 `action: drain` 消费队列 |
| `GET/POST /api/admin/crawler-ingest` | 爬虫入库队列管理（多数操作需维护密码） |
| `GET/POST /api/admin/full-redeploy` | 全量 redeploy（Deploy Hook + 冷却） |
| `DELETE/PATCH /api/admin/taxonomy` | 删除标签/分类或重命名分类 |
| `GET/POST /api/admin/config` | 读/改 Notion 数据库标题（站点名）等相关配置 |

### 维护密码锁

- 共用工具：`src/lib/admin/maintenancePassword.js`
- 优先读 `ADMIN_MAINTENANCE_PASSWORD`，兼容 `ADMIN_FULL_REDEPLOY_PASSWORD`，默认兜底 `123456.`
- 覆盖：爬虫管理、全量更新、贩售机地址编辑（改 title/url）
- 单独切换贩售机 `enabled` 不需要维护密码
- 请求侧常见字段/头：`password`、`x-admin-maintenance-password`、`x-full-redeploy-password`

### 保存、媒体与发布约定

- 编辑器结构化块会转为 Notion blocks；加密内容使用 `LOCK:<password>` callout 协议。
- `contentMediaFlush.js`：正文 pending 图片/加密块图片 → 兰空上传，再进入保存。
- `galleryFlush.js`：图库 pending → 兰空 → 写 Supabase；保存前做容量校验；并发约 4。
- 发布时“尚未添加图片块”提示：仅当正文无图片块且当前文章也无图库图片时弹出；已有图库则视为已有封面候选。
- 后台贩售机编辑页当前只显示开/关；“地址管理”由 `SHOW_VENDING_ADDRESS_ADMIN=false` 隐藏，但解锁与保存逻辑必须保留。

### 友链约定

- Helper：`src/lib/admin/friendsNotion.js`
- 字段：`name`(title)、`url`(url)、`avatar`(files external)、`description`(可选 rich_text)、`status`(status/select)
- API 不需要维护密码，但仍属 admin API，不可暴露给前台访客

### 社媒约定

- Helper：`src/lib/admin/socialLinksNotion.js`
- 子库可命名：`SocialLinks` / `Social Links` / `social-links` / `社交媒体`
- 子库字段：`name`、`platform`(weibo/twitter/pixiv/telegram/instagram)、`status`、`url`
- 保存时自动补齐缺失平台行，并触发 `social-links` 范围刷新

### 回收站与新文章同步

- 移入回收站：乐观隐藏，不显示全屏刷新遮罩；失败恢复卡片；成功后本地改为 `Piece`；revalidate 走队列。Notion 索引未同步时，全量列表刷新不得错误恢复为 `Post`。
- 新文章发布：创建成功后乐观加入列表，顶部持续“正在更新”；用 `/api/admin/posts?syncSlug=&syncId=` 轻量查索引，避免反复全量拉 500+ 条。
- 新 Post 前台刷新约 60 秒后开始，队列 reason 为 `new-post:<slug>`；消费前必须确认 Notion Published Post 索引已收录，否则约 60 秒后重试，最多 8 次；索引就绪后后台可主动做一次文章范围 revalidate。普通编辑仍约 30 秒轻量队列。

---

## 9. 公开 / 运维 API（非 admin）

| 端点 | 用途 |
|------|------|
| `GET /api/public/active-theme` | 返回当前主题（Supabase 优先，再 Notion）；`Cache-Control: no-store`；供前台主题轮询 |
| `GET /api/tweet/post-cover/[slug]` | 按需解析封面（属性封面 → 正文首图）；卡片懒加载复用 |
| `GET /api/gallery/[slug]` | 前台分页读图库图片（需租户配置）；`page`/`limit` 默认 1/24 |
| `GET\|POST /api/gallery/post-stats` | `POST` 递增 view/download；`GET?slug=` 读统计；`GET?mode=popular` 热门 |
| `GET /api/archive/feed` | 归档无限滚动 feed（`page`/`tag`/`category`） |
| `GET /api/check/[url]` | 友链存活探测（HEAD），返回 `up`/`down` |
| `GET\|POST /api/revalidate` | **公开密钥 ISR**；校验 `REVALIDATE_SECRET` 或 `MY_SECRET_TOKEN`；可按 `path` 或 `scope=full`；与 `/api/admin/revalidate` 不同 |
| `POST /api/post/unlock` | 文章全篇密码解锁，返回 token + blocks |
| `GET /api/stats` | Google Analytics Data API（需 GA 相关环境变量），给 Stats Widget |
| `GET\|POST /api/cron/crawler-ingest` | 爬虫入库 cron；需 `CRON_SECRET` |

---

## 10. Gallery、下载与统计

- 图片文件在兰空图床；Supabase 只存元数据、缩略图 URL、排序、文件大小和统计。
- 多租户隔离键：`BLOG_SITE_ID`（对应商户系统 `merchant_services.id`）。
- `src/lib/gallery/blogSite.ts`：校验 site_id、判断租户是否配置、默认容量上限。
- `src/lib/gallery/galleryDb.ts`：读写必须带 `site_id`；唯一约束 `(site_id, post_slug)`。
- 前台单篇图库可分页加载；后台 `GalleryManager.js` 支持上传、拖拽排序、设封面。
- 下载字段：`download`、`download_size`、`download_count`。
- 浏览/下载统计：`src/lib/gallery/postStats.ts`，按 `site_id + slug`。
- feed 缩略图批量读取可走 RPC `get_gallery_feed_previews`（migration 011）。

---

## 11. 文章密码与正文加密（两套机制，勿混淆）

### A. 全篇访问密码（`article_password`）

- Notion 字段名兼容：`article_password` / `Article_password` / `articlePassword` / `文章密码` / `访问密码`
- 前台：`ArticlePasswordGate`
- API：`POST /api/post/unlock`，body `{ slug, password }` 或 `{ slug, token }`
- Token：HMAC-SHA256；密钥优先 `ARTICLE_UNLOCK_SECRET`，否则 `NOTION_KEY`/`NOTION_TOKEN`，再否则开发兜底字符串
- 客户端缓存：`localStorage` 键 `article-unlock-token-${slug}`
- **重要**：`getStaticProps` 仍可能把完整 `blocks` 放进页面 props；锁定态主要是遮罩，不是服务端剥正文。真正二次拉取在 unlock API。不能把它当成强安全机制。

### B. 正文加密块（`LOCK:<password>` callout）

- 前台：`EncryptedCallout.tsx`；密码写在 callout 文本中，客户端比对；`localStorage` 键 `unlocked-${block.id}`
- 后台：Markdown `:::lock` / `LOCK:` 协议写入 Notion callout
- 密码会出现在 Notion/HTML 中，同样不是强安全

---

## 12. 爬虫入库系统

### 相关文件

- 队列：`src/lib/ingest/crawlerQueueDb.ts`（表 `crawler_ingest_queue`）
- 自动设置：`src/lib/ingest/crawlerIngestSettings.ts`
- 单行处理：`src/lib/ingest/processCrawlerGalleryRow.ts`
- 批处理：`src/lib/ingest/runCrawlerIngestJob.ts`
- Cron：`src/pages/api/cron/crawler-ingest.ts`
- 后台 API：`src/pages/api/admin/crawler-ingest.js`
- SQL：`005_crawler_ingest_queue.sql`、`006_crawler_ingest_auto_settings.sql`

### 状态流转

1. 外部爬虫 upsert → `pending`
2. 认领 → `processing`
3. 成功 → `done`（写 Notion Post + 同步图库，再 revalidate）
4. 失败 → `failed`
5. `processing` 超过约 5 分钟 → 自动标 `failed`
6. 后台可 retry / delete / resetProcessing

### 关键行为与陷阱

- 需要 Gallery 租户已配置（Supabase + `BLOG_SITE_ID`）。
- **新建文章 slug 由 Blog 生成**（`p-` + 时间戳），**不用队列里的 slug**。
- 封面取 `image_urls[0]`；无图链直接失败。
- 默认新建 status：`CRAWLER_INGEST_DEFAULT_STATUS` 或 `Published`。
- `vercel.json` cron **每天一次** `0 19 * * *`（UTC 19:00 ≈ 北京 03:00），带 `?auto=1`。
- `auto=1` 时：仅当自动入库开启，且北京时间小时等于配置小时（默认 3）才真正入库。
- 若后台把自动整点改成非 3，而 cron 仍每天只在北京约 03:00 打一次，定时入库基本不会触发。
- `.env.example` 中的 `CRAWLER_INGEST_BATCH_SIZE` 当前代码未作为批大小使用；实际是连续处理直到超时或队列空。
- Cron 鉴权：`Authorization: Bearer ${CRON_SECRET}` 或头 `x-cron-secret`；无 secret 一律 401。
- 后台多数管理操作需维护密码；`summary=1` 轻量摘要除外。

---

## 13. ISR / Revalidate 队列

- 普通保存、置顶、回收站等优先写入 Supabase `blog_revalidate_queue`，按 `site_id + path` 合并 pending。
- 后台延迟触发 `/api/admin/revalidate` 的 `action: drain` 消费；`adminRevalidateClient.js` 会安排多次轻量 drain 兜底。
- 手动刷新 BLOG、主题切换等强一致场景仍可走即时刷新。
- 队列表 SQL：`supabase/migrations/010_revalidate_queue.sql`。
- 未执行该 SQL 或未配置 Supabase/`BLOG_SITE_ID` 时，自动退回旧的即时刷新逻辑。
- 另有公开密钥入口 `/api/revalidate`（`REVALIDATE_SECRET` / `MY_SECRET_TOKEN`），给外部/运维用，不要与 admin 队列入口混淆。
- Notion ISR 读取使用请求作用域缓存与约 500ms 请求启动间隔：同一次页面再生中的归档、Widget、数据库元数据只读一次；不跨 ISR 请求缓存文章正文。
- 运行期 Notion 限流时，不得把 `PRO BLOG` 等默认站点信息写入页面缓存。
- 空页面 ID 不得请求 Notion blocks；构建期临时 Notion 错误重试耗尽后，可用空数据完成部署，交由后续 ISR 恢复。

---

## 14. 全量更新（Full Redeploy）

- 后台「全量更新」走 Vercel Deploy Hook：`VERCEL_DEPLOY_HOOK_URL` 或 `VERCEL_REDEPLOY_HOOK_URL`。
- 冷却时间：**代码实现为 12 小时**（`fullRedeploy.ts` / AdminDashboard）；SQL 注释若写 24h 以代码为准。
- 冷却记录：`blog_site_settings.last_full_redeploy_at`；无 Supabase 时有进程内兜底 Map。
- 需要维护密码；未配置 Deploy Hook 或缺少 `BLOG_SITE_ID` 时不可用/受限。
- ISR 预热穿透部署保护可用 `VERCEL_AUTOMATION_BYPASS_SECRET`；预热公网地址可用 `BLOG_PUBLIC_URL`。

---

## 15. 创作者平台 / 商户分发接入

协议详见 `docs/ADMIN_LOGIN_TOKEN.md`。

- Blog 侧只通过环境变量验签，不读商户数据库。
- Query：`login_token`
- JWT：`iss=pro-merchant`，`purpose=admin_login`，`aud` 匹配当前 Host，`sub` 等于 `AUTH_USER`；若配置了 `BLOG_SITE_ID`，JWT `site_id` 必须一致。
- 验签通过后写 Cookie `internal_auth`，并 302 到不带 token 的 `/admin`。
- 迁移期仍可用 `?auth_u=&auth_p=`；`DISABLE_LEGACY_URL_PASSWORD=true` 可关闭。

### Middleware 鉴权顺序（`src/middleware.ts`）

matcher：`/admin`、`/admin/:path*`、`/api/admin/:path*`

1. `login_token` JWT
2. Legacy URL 密码（若未禁用）
3. `Authorization: Basic ...`
4. Cookie `internal_auth`

Cookie 细节：

- 值：`btoa(`${user}:${pass}`)`
- `httpOnly`、`sameSite: 'lax'`、`maxAge: 86400`、`path: '/'`，生产 `secure: true`

默认凭据兜底（代码侧）：`AUTH_USER || 'admin'`，`AUTH_PASS || '123456'`。  
API 层还有 `verifyAdminRequest(req)` 二次校验；敏感操作另加维护密码。

---

## 16. Supabase 结构一览

| 文件 | 作用 |
|------|------|
| `supabase/gallery_schema.sql` | 一键建 `galleries` + `gallery_images`（多租户）、触发器、RLS 等 |
| `supabase/post_stats_schema.sql` | `post_stats` + `increment_post_stat` RPC |
| `supabase/RUNBOOK_fresh_reset.sql` | 测试环境清空后按最新 schema 重建 |
| `supabase/RUNBOOK_site_id_upgrade.sql` | 旧单租户升级加 `site_id` |
| `migrations/002_site_id_multi_tenant.sql` | 已有表加 `site_id`、改唯一约束 |
| `migrations/003_blog_site_settings.sql` | `blog_site_settings`（含 `theme_code`） |
| `migrations/004_blog_site_full_redeploy.sql` | `last_full_redeploy_at` |
| `migrations/005_crawler_ingest_queue.sql` | 爬虫队列表 |
| `migrations/006_crawler_ingest_auto_settings.sql` | 自动入库开关/北京时间整点 |
| `migrations/007_vending_enabled.sql` | `vending_enabled` 兼容兜底字段 |
| `migrations/008_gallery_theme_cooldown.sql` | 旧 Gallery cooldown 字段（代码已不用） |
| `migrations/009_theme_switch_quota.sql` | 主题切换 24h/4 次配额字段 |
| `migrations/010_revalidate_queue.sql` | ISR revalidate 队列 |
| `migrations/011_gallery_feed_previews_rpc.sql` | `get_gallery_feed_previews` RPC |

---

## 17. 环境变量与密钥安全

- 不要打印、暴露、提交 `.env`、API Key、Token 或 service role key。
- `SUPABASE_SERVICE_ROLE_KEY` 只能在服务端使用。
- `NEXT_PUBLIC_SUPABASE_URL` 应是项目根地址，不要带 `/rest/v1`（`normalizeSupabaseUrl` 有兜底）。

### 核心变量

| 变量 | 用途 |
|------|------|
| `NOTION_KEY` / `NOTION_TOKEN` | Notion API |
| `NOTION_PAGE_ID` / `NOTION_DATABASE_ID` | 数据库 ID |
| `AUTH_USER` / `AUTH_PASS` | 后台登录 |
| `BLOG_LOGIN_JWT_SECRET` | 商户 login_token 验签 |
| `BLOG_SITE_ID` | 多租户站点 ID |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 根 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服务端密钥 |
| `GALLERY_QUOTA_GB` | 图库容量上限（默认 50） |
| `LSKY_TOKEN` / `LSKY_URL` / `LSKY_MAX_UPLOAD_MB` | 兰空图床 |
| `NEXT_REVALIDATE_SECONDS` | ISR 过期秒数 |
| `DISABLE_LEGACY_URL_PASSWORD` | 关闭 URL 明文登录 |
| `ADMIN_MAINTENANCE_PASSWORD` / `ADMIN_FULL_REDEPLOY_PASSWORD` | 维护密码锁 |
| `CRON_SECRET` | 爬虫 cron 鉴权 |
| `REVALIDATE_SECRET` / `MY_SECRET_TOKEN` | 公开 `/api/revalidate` |
| `ARTICLE_UNLOCK_SECRET` | 文章解锁 token（可选） |
| `VERCEL_DEPLOY_HOOK_URL` / `VERCEL_REDEPLOY_HOOK_URL` | 全量更新 |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | 预热穿透部署保护 |
| `BLOG_PUBLIC_URL` | 预热用公网地址 |
| `NEXT_PUBLIC_SITE_URL` | SEO canonical / OG / sitemap |
| `CRAWLER_INGEST_DEFAULT_STATUS` | 爬虫新建默认 status |
| `ENABLE_REMOTE_IMAGE_PROBE` | 封面 blur 远程探测（默认关） |

---

## 18. 评论、客服与未接线能力

- 评论：`ENABLE_COMMENT` 当前 `false`；配置在 `COMMENT_CONFIG`（Twikoo / Giscus）；文章页仅在开关打开时挂 `CommentSection`。
- Chatwoot：`_app.tsx` 中 `CHATWOOT_ENABLED = false` 硬关；即便打开，也排除 `/admin`。
- `smartPostParse.ts` / `smartParseTemplates.ts`：已实现从标题串解析 title/category/tags/下载信息的库与模板存储，**当前后台 UI 未接线**，不要写成已上线功能。

---

## 19. 开发约定

- 以本 `AGENTS.md` 为准；新功能的重要逻辑、规则或约定要及时补充。
- 改代码前先读相关目录、依赖和关键文件，理解当前实现后再动手。
- 简单优先：只做用户要求的功能，不加投机性扩展，不顺手重构无关代码。
- 外科手术式修改：只改必须改的文件，匹配现有风格；不要清理或格式化无关文件。
- 保护用户已有修改：工作区可能是脏的，不要回滚自己没改的内容。
- Notion 属性写入要兼容旧/新 schema（标题 `title`/`Page`，状态 `status`/`select`，下载 `rich_text`/旧 `url` 等）。
- Supabase 多租户表读写必须带 `site_id`，除非代码明确处理未配置时的降级路径。
- 修改主题配置、图库、统计、贩售机、爬虫队列等站点级状态时，优先检查 `BLOG_SITE_ID` 和 Supabase 配置。
- 修改前台页面时注意 Gallery/Tweet 独立壳层，不要默认所有页面都走 `BlogLayout`。
- 修改后台保存逻辑时注意 revalidate 路径范围与队列语义。
- 修改图片上传或图库保存时注意 Vercel 请求体限制、兰空 Token、客户端压缩和容量校验。
- 改 slug 保留/过滤规则时，同时核对 `[page].tsx`、`RESERVED_POST_SLUGS`、后台 `SPECIAL_PAGE_SLUGS`。

---

## 20. 验证建议

- 普通前台：`npm run lint` 或本地 `npm run dev` 打开对应路由。
- 后台/API：确认 `/admin` 能加载，API 返回结构不破坏 `AdminDashboard` 调用；Notion 写入避免用真实敏感数据做破坏性测试。
- Gallery：后台保存、前台文章页加载、容量条、`site_id` 隔离。
- 主题：至少确认 `gallery`、`tweet`、`tweet-light`、`tweet-dark`、默认主题互不破坏。
- 登录/商户分发：Basic / Cookie / JWT 三条路径；token 不留在 URL。
- ISR：检查路径收集范围、冷却、队列 `queued: true`、drain 消费、pending 合并。
- 爬虫：确认 cron 鉴权、自动整点与 vercel cron 对齐、失败重试与图库同步。
- 密码保护：分别验证全篇密码与加密块，并清楚其安全边界。
- 公告弹窗：确认无跳转按钮、浅/深色主题样式、「知道了」关闭后同会话不再弹；后台「广告位」Tab 含内页广告且「组件」Tab 仍含公告。

---

## 21. 当前已知注意点

- `AdminDashboard.js` 很大；局部修改前先用搜索定位状态、handler 和渲染分支。
- 生产构建忽略 TS/ESLint 错误，新增代码要自觉保持正确。
- Windows 控制台下部分中文注释可能乱码；编辑文件保持 UTF-8。
- `blog.config.ts` 中 `FREINDS` 是历史拼写，除非做兼容迁移，不要直接改名。
- 默认 `STATIC_POST_PATHS_MAX=0`，不要误以为所有文章都会在 build 阶段预渲染。
- 全量更新冷却以代码 12 小时为准。
- `/api/admin/theme-cooldown` 名称过时，语义是主题切换配额。
- 爬虫自动入库依赖「每天一次 cron」与「配置整点」对齐。
- 文章全篇密码与加密块都不是强安全机制。
- 双 revalidate 入口：公开密钥 `/api/revalidate` vs 后台队列 `/api/admin/revalidate`。

---

## 22. 文档维护约定

每次完成关键功能节点后，至少检查并更新本文件中对应章节：

1. 新增/变更的 API、Widget、slug、环境变量
2. 前后台数据流与 revalidate 行为
3. Supabase 表/迁移与降级路径
4. 安全边界与已知陷阱
5. 验证方式

若某能力“库已实现但未接线”，必须明确写出，避免后续误判为已上线。
