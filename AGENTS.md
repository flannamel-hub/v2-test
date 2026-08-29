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
- `linked_product_sku`（P18：shop 主题文章关联商品 SKU，列名兼容大小写/中文）
- 部分字段存在大小写或旧字段兼容逻辑；改动时先读 `src/lib/notion/readProperty.ts` 和相关 API 的动态属性判断

### 系统级 slug / Widget（勿当作普通公开页）

| slug | 用途 | 主要约定 |
|------|------|----------|
| `theme-config` | 远程主题配置 | 通常用 `excerpt` 存主题代号；保存时双写 Notion + Supabase |
| `gallery-ad` | 内页广告位 | `status` Published=开 / Hidden=关；全主题文章内页底部横幅；Gallery 下载页也会显示 |
| `vending` | 贩售机入口 | `title`=按钮文字，`excerpt`=URL，`Published`=开 / `Hidden`=关 |
| `announcement-popup` | 公告弹窗（通知） | `title`/`excerpt`/`cover`；**无跳转按钮**；旧 `button_text`/`button_url` 保存时清空，字段不存在则忽略 |
| `popup-ad` | 弹窗广告 | `title`/`excerpt`/`cover`/`button_text`/`button_url`；`Published`=开；**仅首页**；`sessionStorage` 每会话一次；与公告同时开时先公告后广告 |
| `click-ad` | 遮罩广告 | `title`=备注名，`excerpt`=广告 URL，`Published`=开；**仅首页**；`localStorage` 每天一次；排除贩售机/弹窗；原点击仍有效 + `window.open` 新标签 |
| `banner` | Shop 首页 Banner（P18-C4-1） | `title`=图片 URL（逗号分隔多图，兼容换行/中文逗号），`excerpt`=可选跳转链接（http(s) 或 / 开头）；`Published`=开；**仅 shop 主题首页顶部**；1 图静态、多图自动轮播（零依赖，约 5s/张，支持按钮/圆点/触摸滑动）；前台读取 `shopBannerSettings.getShopBannerConfig`，index 仅在 shop 主题时下发 `shopBanner` prop |
| `social-links` | 社交媒体 | 父级 `status` 控制开关；内嵌 SocialLinks 子数据库 |

`[page].tsx` 会过滤：

- `CONFIG.DEFAULT_SPECIAL_PAGES` 全部值：`tag`、`category`、`archive`、`friends`、`about`、`download`
- 以及：`theme-config`、`gallery-ad`、`vending`、`announcement-popup`、`popup-ad`、`click-ad`、`social-links`、`banner`

新建文章保留 slug（`RESERVED_POST_SLUGS`）：

- `announcement`、`about`、`download`、`theme-config`、`gallery-ad`、`vending`、`announcement-popup`、`popup-ad`、`click-ad`、`social-links`、`banner`

注意：后台 `AdminDashboard.js` 内 `SPECIAL_PAGE_SLUGS` 列表更短（主要用于列表分类），与上述两处不完全一致；改 slug 保留规则时建议三处一起核对。

### 其他 Notion 约定

- `announcement`：公告**文章** slug（不是系统 Widget）；首页会过滤，不进普通文章流。
- 系统保留分类：`网站信息`、`系统组件`、`站长通知`（不可选、不可删除/重命名）；`未分类` 为兜底分类（删除分类后文章自动归入；下拉可选，但不可删除/重命名）。后台分类删除/重命名会保护这些名称。此外：无分类（category 为空）的文章在前台统一显示「未分类」（固定 id `wei-fen-lei`），后台「未分类」文件夹也包含无分类文章。
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
| `shop` / `mall` | `shop`（P18-C1 新增，商城主题） |

### shop 主题（P18-C1）

- 目录 `src/themes/shop/`：`ShopHome`（首页+文章列表，商品化卡片网格）、`ShopPostCard`（卡片，读 `options.linkedProductSku` 显示「商品」角标）、`ShopPostPage`（文章详情，复用 standard 头部/正文/广告骨架）、`ShopProductBar`（详情页关联商品条，C2 在此扩展购买按钮）、`ShopArchive`（归档网格）。
- **shop 不使用独立壳层**：走默认 BlogLayout（Navbar + Footer），Widget、贩售机、公告/广告弹窗、图库统计等全部沿用现有机制（`usesStandaloneThemeLayout` 对 shop 返回 false）。
- 分类/标签/友链/关于/下载等页面 shop 暂走默认渲染（与 anzifan 相同）；归档页有 shop 分支（`archive/index.tsx`、`archive/[page].tsx`）。
- `shouldLoadGalleryFeedCovers` 已包含 shop（列表封面回退链与 anzifan 一致）。
- 文章↔商品映射（P18-C3 改为人工挂链接）：Notion 属性三字段 `linked_product_url`（商品链接，url/rich_text 均可）、`linked_product_sku`（商品码，兼容 `Linked_product_sku` / `linkedProductSku` / `关联商品` 列名；select 与 rich_text 均可读写）、`linked_product_price`（价格，rich_text，纯展示）；前台 pipeline 输出为 `post.options.linkedProductUrl / linkedProductSku / linkedProductPrice`。后台编辑入口是 Step7「＋ 添加商品信息」按钮+查询弹窗（P18C45FIX B2；浅粉标注 shop 系列主题专用；三字段均可留空），保存时列不存在会自动补建（rich_text）。前台「立即购买」优先 `linked_product_url`，为空时兜底 `{NEXT_PUBLIC_STORE_URL}/p/{sku}`；「加入购物车」仅在有 sku 时渲染；`buildCheckoutUrl` 结算仍按 sku 编码。C1 的 Step1「关联商品」下拉与系统侧 `GET /api/admin/merchant-products` 调用已移除（API 文件保留，后台不再调用；前台 `ShopProductsSection` 仍走公开端点 `/api/shop/products`）。
- **shop v1 基础设施（P18-C4-1，2026-08-27）**：① Banner——`ShopBanner.tsx` 渲染于 ShopHome 顶部（见上表 `banner` 行），后台「组件」Tab 有 `ShopOnlyTag` 标注的「Banner」卡片（图片 URL 每行一条、跳转链接、开关）；保存走 `/api/admin/banner`（路由内 `verifyAdminRequest`），revalidate scope=`banner`（仅刷 `/`）。② 顶部导航——`withNavFooter` 在 shop 主题用 `ShopNavbar`（Logo+首页+已发布自定义页面+「游客查单」外链 `store.pro-pl.us/orders`+购物车徽标）替换默认 Navbar；移动端汉堡菜单收纳导航链接，查单与购物车常驻可见。③ ShopHome 底部「最新动态」公告区（读 `widgets.announcement`，无则整块不渲染）；Footer 仅在 shop 主题下发社媒（`social-links` widget，无则隐藏）。
- **shop 视觉重构（P18-C4-4A，2026-08-28，完全还原独角数卡，仅首页/归档；内页沿用 standard）**：① 容器统一——shop 组件一律 `mx-auto w-full max-w-7xl px-4 md:px-6`（1280px；ShopHome 三处/ShopNavbar/ShopCatalogSection/ShopArchive 已换，`ShopArchive` 不再用共享 `ContainerLayoutFull`）；② ShopNavbar 重写——`fixed top-0 left-0 right-0 z-50` + 毛玻璃，壳层 `withNavFooter` 对 shop 在 `<main>` 加 `pt-14` 补偿（全页面生效）；导航项=图标+文字（首页 FiHome/商品中心 FiGrid→`/archive`/自定义页 FiBookOpen/更多 FiMoreHorizontal→`/friends`），自定义页过滤 slug ∈ {tag,category,archive,friends}（about/download 保留）；右侧=游客查单（ghost）/购物车（`ShopCartButton` 改 ghost 图标+文字+右上角数量徽标，neutral-900/white 反色）/主题切换（`next-themes` Sun/Moon，挂载前渲染 Moon）；已移除 Logo 图标与 `logo` prop；③ ShopBanner 重写——高度阶梯 `min-h-[200px] sm:min-h-[240px] md:min-h-[320px] lg:min-h-[420px]`、全图 `bg-black/50` 遮罩、文字层固定（标题 max-w-4xl semibold、副标题 text-gray-100、按钮「查看更多」rounded-full bg-black/40 border-white/25 backdrop-blur→`/archive`），`banner.link` 整图链接逻辑已删除（字段被忽略），多图=底部正中央白点圆点（P18C43-D2 已删右上左右箭头，圆点 `absolute bottom-3 left-1/2 -translate-x-1/2`，自动轮播/悬停暂停/触摸滑动保留），无「Banner」胶囊；④ Footer 新增 `wide` prop（shop 传 true 用 max-w-7xl，其他主题默认容器不变）。
- **shop Banner 三修（P18C43-D1~D3，2026-08-28）**：① D1——`/api/admin/banner` 保存成功后服务端即时 revalidate `/` 并预热（`maxDuration 60`），修「开启了不显示」（3600s ISR 缓存 + SWR 首访旧页）；② D2——见上文 C4-4A ③（删箭头、圆点底部居中）；③ D3——后台 Banner 视图图片输入由 textarea 改为「img-drop 拖拽/点选上传区（多图、上限 8、逐张 `uploadImageToLsky`、显示 上传中 x/y 进度与失败红字）+ 缩略图网格（132×74、序号徽标、悬停「×」删除、HTML5 拖拽排序）」；数据仍以换行分隔 `imagesText` 承载，保存路径/校验不变；上传中禁删除/禁再拖入。
- **shop 购物车抽屉核心修复（P18-C4-3 批3 C1~C3，2026-08-28）**：① C1 列表空白根因——`ShopNavbar` 的 `<header>` 带 `backdrop-blur-md`，会使 fixed 后代的包含块变成该 56px 导航条，抽屉原位渲染被压进导航条（列表区塌陷 0 高、合计/结算溢出悬浮，即「合计 4 件但列表空白」）；修复=抽屉经 `createPortal` 挂 `document.body`，此后弹层类组件不得直接渲染在带 backdrop-blur/transform 的祖先内部；② C2 加购合并——`shopCart.addToCart` 同 siteId+同 SKU qty 累加不新增条目，新导出 `MAX_CART_QTY=99`（BLOG 侧无库存信息，统一封顶），`updateCartQty` 同步钳制 1..99；③ C3——抽屉列表行「-」在 qty=1、「+」在 qty=99 禁用，顶部「清空」两步确认（3s 自动复位）+「购物车已清空」内联轻提示（前台无 toast 库，勿引入）；展示层拆出 `ShopCartDrawerContent`（纯 props）供冒烟/测试直接渲染；新增 `src/types/react-dom.d.ts` 最小 `createPortal` ambient 声明（@types/react-dom 未安装，顺带消除 4 处 react-dom TS7016 基线）。
- **shop 购物车抽屉样式与交互（P18-C4-3 批4 C4~C7，2026-08-28）**：① C4 面板高级化——不贴角（`top-3 right-3 bottom-3` 留边、宽 `w-[min(430px,92vw)]`、`rounded-l-2xl`），浅色 `bg-white/95`/深色 `dark:bg-neutral-900/95`+`dark:border-white/10` 不透明面板，挂载后 rAF 一帧切入 `translate-x-0` 平滑滑入（`motion-reduce:transition-none` 降级）；标题区=购物车图标+「购物车」+「共 N 件」合计徽标+关闭叉（全面板仅 1 个 h2）；② C5 打开抽屉不再写 `document.body.style.overflow`，背景页面可正常滚动，仅遮罩本身 fixed（Esc 关闭保留）；③ C6 空白遮罩 `onClick={onClose}` 关闭、面板 `stopPropagation`（列表/按钮点击不关闭；抽屉在批3 已 createPortal，勿回退）；④ C7「去结算」`<a target="_blank" rel="noopener noreferrer">` 新标签打开 store 结算页（防后退键落回贩售机），URL 仍 `buildCheckoutUrl`（现为 `sku:qty[:price]` 格式）；空车态「去商店逛逛」是 BLOG 站内链，保持同窗+自动关抽屉，不加 target。冒烟脚本 `tmp/opencode/p18c43c4-ssr/smoke.tsx`（43 断言，覆盖样式类/遮罩关闭/新窗口结算/无 body 锁 + 批3 回归）。
- **shop 归档「商品中心」重写 + 首页精选分页（P18-C4-4 批1 A1~A4/B1~B2，2026-08-28）**：① A1——`ShopArchive` 顶部弃用 `LargeTitle`（其 title 来自 Notion「归档」页），改为硬编码面包屑（首页 ›，`next/link`）+ 大标题「商品中心」（`text-3xl font-extrabold`，独角数卡 products 版式）；`page` prop 保留在类型中但不再读取；② A2——`ShopCatalogSidebar` 搜索文案改「搜索商品名称」（aria-label 搜索商品）、分类列表仅名称**无计数**（`totalCount` prop 已删除，`SIDEBAR_ITEM_BASE` 去掉 justify-between），归档工具条不再显示「共 X 篇/匹配 X 篇」（保留筛选中「清除筛选」按钮）；③ A3——标签栏（shop 独有增强）保留在分类卡下方与移动端 chips；④ A4——商品卡 `auto-fill minmax(228px,1fr)` 网格、网格/列表切换与服务端 `/archive/[page]` 分页不动；⑤ B1/B2——`ShopHome` 精选区改客户端分页：`SHOP_FEATURED_PAGE_SIZE=8`（lg+ 4 列×2 排，删 `xl:grid-cols-5`），列表先按「带商品优先」稳定分区（`sortFeaturedPosts`，Step7 三字段任一非空即商品文章），导出 `sliceFeaturedPage`/`getFeaturedPageWindow`（当前页±2 最多 5 个，同独角数卡）供冒烟直测；总数 ≤8 不渲染分页控件，翻页 `scrollIntoView` 平滑回商品区顶部（`scroll-mt-20` 补偿 fixed 导航，`prefers-reduced-motion` 降级 auto）。冒烟脚本 `tmp/opencode/p18c44b1-ssr/smoke.tsx`（37 断言 + registry/GalleryArchive/archive 页编译回归）。
- **shop 卡片+购物车状态一致性（P18-C4-4 批2 C1~C5，2026-08-28，依 `P18C44_B2_BRIEF.md`）**：① C1——`ShopPostCard` 标题下新增 Notion tags 单行行（`CardTagLine`：固定 `h-6` 只占一行、无 tag 空占位保卡片等高、`overflow-hidden` 绝不换行；挂载后按 `clientWidth` 测量折叠为「+N」，被折叠 chip 以 `absolute invisible` 留 DOM 供测量，纯函数 `foldSingleLineTags` 导出供直测）；封面左下角标签胶囊（B3）与「商品可购」徽章行（B1）已移除——该位置语义=站长 Notion tags，与独角数卡系统状态徽章同位不同义，勿混；标题下留白收紧（mt-1.5 / footer md:pt-3）。② C2——卡片底栏购物车按钮左侧新增闪电「立即购买」小按钮（`FiZap` 黑底主按钮，`window.open` 新窗口；仅挂链接无 sku 时单按钮；无商品文章不显示）。③ C3——加购改持久状态：新 hook `src/themes/shop/useShopCartSkuQty.ts`（readCart 按 sku 聚合 + `SHOP_CART_CHANGE_EVENT`/storage 实时刷新，`ShopCartSkuBadge` 同源改用）；qty>0 时图标钮绿描边+FiCheck+角标、bar 显「已加入 ×N」（`shopCartButtonLabel`），`ADD_FEEDBACK_MS` 2 秒临时态已删除；卡片/内页共用 `ShopBuyButtons` 状态天然一致。④ C4——重复加购确认：新导出 `addWithDuplicateConfirm`/`duplicateAddConfirmMessage`，sku 已在购物车（qty>0）再点先 `window.confirm('该商品已加入购物车(×N),确定继续添加?')`，取消不加、首加不弹、卡片/内页同生效。⑤ C5——价格提示小字「价格以结算页为准」（`text-[10px] text-neutral-400`）：卡片价格下方固定 `h-3` 行（普通卡空占位保底栏等高，避免行内挤压窄卡溢出），内页 `ShopProductBar` 价格右侧基线对齐。冒烟脚本 `tmp/opencode/p18c44b2-ssr/smoke.tsx`（45 断言 + registry/ShopHome/ShopArchive/ShopProductBar/archive 页编译回归）。
- **shop 其他修复（P18-C4-4 批3 D 系列，2026-08-28，依 `P18C44_B3_BRIEF.md`；D1/D5 主站部分需 Hermes 代写入）**：① D2——`Footer.tsx` 社媒未配置/空数组/关闭时不再渲染灰圈占位（上一版三圆圈已删），仅 `socialLinks` 非空才渲染 `SocialLinks`。② D3——`ShopBanner.tsx` 轮播过渡修复：全部 Banner 图 `loading="eager"` 常驻 DOM 预加载；`loadedMap`（按图片地址）经 `onLoad` + `ref.complete`（缓存图兜底）标记加载完成，自动轮播推进与 `go()`（圆点/滑动）在目标图未加载完成前保持当前图，保证切换始终为两图就绪间的 opacity crossfade、无白闪瞬切。③ D4——`ShopNavbar.tsx` 新导出 `normalizeShopNavLabel`：slug=`about` 或标题恰为「介绍」的自定义页导航统一显示「关于」（归一化后仍命中 PAGE_ICON_RULES 的 people 图标），其余文案原样。④ D5——`buildCheckoutUrl` 增可选第 4 参 `siteTitle`（trim 后非空才追加 `&site_title=encodeURIComponent(...)`，不传/空白保持旧格式）；新 `ShopSiteTitleProvider`/`useShopSiteTitle`（`ShopSiteContext.tsx`，默认空串），`withNavFooter` 两个分支均以 `siteName` 注入，`ShopCartDrawer` 结算 URL 携带站点标题；**主站 store 侧两处未写（不在本仓库，需 Hermes 代为）**：`store/app/orders/OrdersPageClient.tsx` 删除左上角 fixed「返回贩售机」按钮及 ArrowLeft/Link import（空态「去逛逛」保留）；`store/app/cart/CartPageClient.tsx` 读取 `site_title` 查询参数升级 siteLabel（显示「站点:标题」，缺失回退现有 UUID/「未指定站点」逻辑）。冒烟脚本 `tmp/opencode/p18c44b3-ssr/smoke.tsx`（32 断言 + registry/withNavFooter/Footer/shop 组件 esbuild 编译回归）。
- **shop 卡片商品式样与不可购买提示（P18C45FIX 批1 B1，2026-08-28，依 `P18C45FIX_B1_BRIEF.md`）**：① post.js——商品码权威否定（未找到/已下架）时**保留 sku**，仅清 url/price（`linkedProductSaved = { sku: 原码, url: '', price: '', name: '' }`），前台据 sku 展示商品区但不可购；回执文案改「前台购买/加购将提示不可购买」；用户主动清空 sku 仍三字段全清（不变）；`fetchMerchantProductBySku` 只传 `?sku=`（主站 9f6bd59d 已支持，无 site_id）。② 前台 hasProduct 判定**仅看 sku 非空**（`ShopPostCard.readProductFields` / `ShopProductBar`）：卡片价格行随 sku 渲染、缺价显示「—」+「价格以结算页为准」；内页购买条仅存 sku 仍渲染（chip+「—」+提示），三字段全空仍整块不渲染（普通文章内页保持标准样式）。③ `ShopBuyButtons` 两钮（立即购买/加购）**始终渲染**（普通文章卡也是商品式样）；购买只认 buyUrl（P18-C4-5 保存联动写入 `{STORE}/p/{sku}`），**删除了 sku 兜底拼 `{storeUrl}/p/{sku}`**——无 buyUrl 或无 sku 点击弹 `window.alert('当前不可购买')`（新导出 `NOT_PURCHASABLE_MESSAGE`/`notifyNotPurchasable`，前台无 toast 库）；bar 有 url 渲染 `<a target=_blank>`、无 url 渲染同款 `<button>` 提示；重复加购确认（C4）与持久已加入态（C3）回归保留。冒烟脚本 `tmp/opencode/p18c45fix-b1-ssr/smoke.tsx`（49 断言 + registry/ShopHome/ShopArchive/ShopPostCard/ShopProductBar/ShopBuyButtons/archive 页 esbuild 编译回归；tsc 与上批基线逐字节一致 0 新错）。
- **shop Step7「添加商品信息」按钮+查询弹窗（P18C45FIX 批2 B2，2026-08-28，依 `P18C45FIX_B2_BRIEF.md`）**：① 新增代理 `GET /api/admin/merchant-product-lookup?sku=`（路由内 `verifyAdminRequest`，401/405/400 分支；复用 `fetchMerchantProductBySku` 8s 超时，`MERCHANT_API_TOKEN` 仅服务端 Bearer 透传、响应字段白名单 sku/name/price/status，零 token 暴露；返回 `{success,available,product|null,source?,error?}`，`available=false`=主站不可达/超时、`product=null`=未找到）。② AdminDashboard Step7 弃用 StepAccordion（无「Step」文案），改为**独立长按钮**「＋ 添加商品信息」（虚线描边浅粉功能按钮+浅粉标注「仅 shop 主题支持添加商品」）；点击打开弹窗（复用 lock/link 弹窗模式）：提示文案+「商品码（编号）」输入（自动大写/trim、Enter 查询/Esc 关闭）+「查询」按钮+异步结果区——查到且在售显示「商品名称/价格(¥ 前缀)/状态:在售」+「确认使用该商品」（仅在售可确认，写 `linked_product_sku` 优先系统返回规范 sku）；未找到/已下架/接口异常显示红色提示（客户端 `lookupErrorText` 把 abort 映射「查询超时(8s)」；`isShopLookupProductOnSale` 与服务端 off-sale 词表镜像）；客户端另有 10s AbortController 兜底。③ 旧文章 Step7 区显示「已关联商品」卡（商品码+只读 url/price）+「清除关联」小按钮（保留可解除关联能力，清 sku 保存时三字段联动清空）；「添加商品信息」按钮点开弹窗可改 sku。保存流程不变：post.js 保存时仍权威再查一次（B1 逻辑：查不到保留 sku 清 url/price，接口异常保留原记录）。验证：esbuild 编译+tsc 0 新错；本地 stub 上游全链路 8 断言通过（鉴权/方法/空 sku/在售/下架/未找到/8s 超时~8.03s/字段剥离），dev 编译 chunk 13/13 字符串命中；真实主站需部署环境含 `MERCHANT_API_TOKEN`（本地 `.env.local` 未配时上游 401 属环境缺口非代码问题）。

- **shop 归档/卡片对齐独角数卡 B3 批（P18C45FIX 批3，2026-08-28，依 `P18C45FIX_B3_BRIEF.md`，参照 `.dujiao-ref/Products.vue`/`CategorySidebar.vue`）**：① 归档页顶部改居中式——移除左对齐面包屑，`text-center` 大标题「商品中心」（text-3xl/md:text-4xl extrabold）+ 副标题「浏览我们的精选商品」+ 全宽 `h-px` 分隔线。② `ShopCatalogSidebar` 改独角数卡卡片式：桌面侧栏整张圆角卡片（边框+阴影），卡内顶部「搜索」小标题+输入框（placeholder「搜索商品名称」）+「分类」小标题（蓝色竖条 `h-5 w-1 bg-blue-500`）+ 圆角矩形分类按钮（「全部商品」固定首项；选中=`bg-blue-500` 实心白字、hover `bg-blue-400`；`aria-current` 标注）；标签栏保留同卡内、选中态同蓝；移动端搜索框+chips 不变（chips 选中同蓝）。③ `ShopPostCard` 标题下新增摘要位（`data-testid=shop-card-excerpt`，固定 `h-8` 两行等高；有 excerpt→line-clamp-2+省略号+neutral-500，无→`\u00A0` 空占位）。④ tags 行升级多色可点击：新导出 `tagColorIndex`（tag 名 hash→indigo/emerald/amber/sky/rose/neutral 六色板，亮浅底/暗 15% 透明底、hover 提亮）与 `tagHref`（`/tag/{encodeURIComponent(id)}`——**路由按 tag id 匹配，非 tag 名**）；chip 由 span 改 `<button>`（text-xs+px-2 放大，行高仍 h-6），`router.push` 同窗跳转并 preventDefault+stopPropagation 防外层卡片导航；「+N」折叠 chip 保持中性不可点；`foldSingleLineTags` 测量折叠逻辑不变。⑤ `ShopBuyButtons` icon 形态「立即购买」由纯图标钮改文字按钮（⚡ FiZap+「立即购买」，h-8 px-2.5 text-xs 圆角，黑底白字/暗色反白）；购物车图标按钮+角标不变；bar 形态（内页商品条）不变。验证：`tmp/opencode/p18c45fix-b3-ssr/` esbuild 冒烟+回归编译（43 断言 0 失败）；tsc 43 错全为既有基线（stash 前后一致，4 个改动文件 0 错）；项目未配置 ESLint（`next lint` 交互提示，历史如此）。


- **shop 后台按钮/页内提示/Footer/商品名称/购物车文案（P18C45UI 批2，2026-08-29，依 `P18C45UI_B2_BRIEF.md`）**：① AdminDashboard Step7「＋ 添加商品信息」长按钮改**蓝色实心**（`#2563eb` 白字、圆角+阴影、`border:none`；onMouseEnter 提亮 `#3b82f6`、onMouseDown `translateY(1px)` 微降），**删除按钮上「仅 shop 主题支持添加商品」标注 span**；弹窗内说明精简为「输入商品码当场查询系统商品，确认后写入表单。」。② `ShopBuyButtons` 不可购买提示由 `window.alert` 改**页内 toast**：组件内 `notifyNotPurchasable`（局部函数，不再导出 alert 版）置 state → `createPortal` 挂 `document.body`（卡片外壳 hover translate 是 transform，fixed 弹层不得原位渲染，同购物车抽屉 C1 教训），底部居中小条 `role=status` + `data-testid=shop-not-purchasable-toast`，`NOT_PURCHASABLE_TOAST_MS=2000` 自动消失，深浅色双适配；icon/bar 两形态共用；重复加购 confirm 保持原生（用户指定）。③ `Footer.tsx` Admin 齿轮按钮从顶部 nav 行移到**「Powered by」分隔行右侧**（`justify-between` 行第二子元素，`data-testid=footer-admin-gear`，图标/hover 样式不变；顶部行只剩社媒+ThemeSwitch）。④ **linkedProductName 字段链路**：post.js 保存时权威查询成功写 `resolvedName`（`linked_product_name` rich_text，列缺失自动补建；接口异常回退表单回传原值、权威否定/清码时联动清空）；GET 回执增 `linked_product_name`；`readProperty.ts` 新增 `LINKED_PRODUCT_NAME_PROPERTY_NAMES`（linked_product_name/大小写/商品名称）+ `readLinkedProductNameFromPageProperties`（rich_text/url）；`format/post.ts` 与 `types/blog.ts` 透传 `options.linkedProductName`；`ShopProductBar` **去掉「商品码 SKU」chip 与 `data-shop-linked-sku` 属性**，改为优先显示商品名称（缺失回退 `post.title`，`data-testid=shop-bar-product-name`），并把该名传入 `ShopBuyButtons.name`（购物车条目名一致）；`ShopPostCard.readProductFields` 同步返回 `linkedName`（商品名‖标题）传加购。⑤ `ShopCartDrawerContent` 条目行**移除 SKU 编号行**（删 font-mono `{item.sku}` 段），名称缺失用「商品」占位（删除按钮 aria-label 同步），数量/小计/合计/去结算不变。验证：`tmp/opencode/p18c45ui-b2-ssr/` esbuild 冒烟+回归编译（43 断言 0 失败）；tsc 43 错与基线一致 0 新错。

- **shop-v2 主题（P18-C4-7，2026-08-29，依 `P18C47_BRIEF.md`）**：shop 首页变体「单列大卡橱窗」，其余全部复用 shop（归档/内页/购物车/后台/Banner/导航零改动）。① 注册——`types.ts` ThemeId 增 `'shop-v2'`；`registry.ts` 归一 `shop-v2`/`shopv2`→`shop-v2`、`THEME_HOME['shop-v2']=ShopHomeV2`；`shopTheme.ts` `isShopTheme` 增 shop-v2/shopv2；AdminDashboard `ADMIN_THEMES` 增 `{id:'shop-v2',label:'shop v2',desc:'商城风格 · 首页单列大卡橱窗'}`（主题保存为代号字符串直通，双写 Notion+Supabase 不变）。② shop 系分支——`withNavFooter.tsx` 五处 `themeId === 'shop'` 全改 `isShopTheme(themeId)`（ShopNavbar/pt-14/购物车徽标/wide Footer/hideThemeSwitch）；`post/[post].tsx`、`archive/index.tsx`、`archive/[page].tsx` 的 shop 分支改 `isShopTheme(activeTheme)`（内页/归档复用 ShopPostPage/ShopArchive）；`shouldLoadGalleryFeedCovers` 增 shop-v2；index.tsx 经 registry+isShopTheme 自动接线（Banner 通道含 shop-v2，零改动）。③ 新组件 `ShopHomeV2.tsx`——Banner/标题行/最新动态与 ShopHome 完全一致（容器 max-w-7xl 同 Banner），仅精选区改单列 `flex flex-col gap-6` + `ShopPostCardLarge`，`SHOP_V2_PAGE_SIZE=4` 每页 4 张客户端分页（复用 `sortFeaturedPosts`/`sliceFeaturedPage`/`ShopPagination` + 翻页平滑回顶/reduced-motion 降级）。④ 新组件 `ShopPostCardLarge.tsx`——全宽单列：封面 `aspect-video` 16:9（PostImage 懒加载+hover scale-105，无封面渐变回退）；下方功能 Bar 圆角卡（白/暗底+border+shadow-card，hover 描边提亮+发光阴影、整卡 hover -translate-y-1）：行1 分类（`分类 · x`，sm+ 显示）+ tags（复用 `CardTagLine`，`ShopPostCard.tsx` 导出并增可选 `rowClassName` 覆写布局，默认样式不变）；标题 text-xl/2xl；左下商品名（`linkedProductName`‖标题）+ ¥ 价格（text-2xl/3xl 白色；无价「暂无」）；右下复用 `ShopBuyButtons` icon 形态全部逻辑（角标/已加入×N/不可购居中弹窗/重复加购确认）+ 桌面端箭头；整卡 PostNavLink 进文章页；无 sku 普通文章同样渲染按钮（点击=不可购弹窗）。验证：`tmp/opencode/p18c47-ssr/` esbuild 冒烟（66 断言 0 失败：注册归一/主题列表/单列 4 张/aspect-video/分页数学/无 sku 弹窗/shop 回归）+ 13 入口回归编译 OK；tsc 43 错与 P18C45FIX-B2 基线逐条一致 0 新错。

- **非 shop 主题文章内页购买条 + 重设计（P18-C4-6 / P18C46REDESIGN，2026-08-29，依 `P18C46REDESIGN_BRIEF.md`）**：① `src/themes/shop/ArticleProductBuyBar.tsx`（组件在 shop 目录但服务**非 shop** 主题）——standard/anzifan 走 `variant="standard"`（`post/[post].tsx`），gallery 走 `variant="gallery"`（`GalleryPost.tsx`），tweet 系走 `variant="tweet"`（`TweetPostPage.tsx`，tweet/tweet-light/tweet-dark 共用），均渲染于正文前；判定**只看 sku 非空**，无 sku 整块 null；仅「立即购买」（有 buyUrl 新窗口 `<a>`，无 buyUrl 弹「当前不可购买」页内 modal，portal 挂 body/Esc/遮罩/知道了三关闭，复用 ShopBuyButtons 文案）；名称缺失回退文章标题、价格缺失「—」灰占位、¥ 前缀去重。② P18C46REDESIGN 重设计**仅非 standard 分支**（Uiverse by reshades，用户指定）：容器=rounded-2xl 精致卡（浅 `bg-white`+`border-neutral-200`+`shadow-sm`/深 `#1c1c1e`+`border-white/10`，px-5 py-4）；chip 蓝调（`bg-blue-500/10 text-blue-600`/dark `blue-400`）；名称 `font-semibold`（`text-neutral-900 dark:text-white`）；价格 `text-xl font-extrabold text-[#3654ff]`（dark 提亮 `#8b9dff`）；按钮=**透明底+`border-2 border-[#3654ff]`+白字+rounded-[11px]+8.5em×2.9em+`duration-[600ms]`，hover `bg-[#3654ff]` 填充+箭头 `group-hover:translate-x-[5px]`**；白字/白箭头在浅色卡上靠 `[text-shadow:0_1px_2px_rgba(0,0,0,0.5)]`+`drop-shadow-[...]` 保证可读（文字始终白色是拍板约束，勿改回深字）；箭头 SVG 绝对定位 `right-[0.8em]`、`pointer-events-none`。③ **standard 分支与 shop 组件（ShopProductBar/ShopBuyButtons）零改动**：name/price/container/buy 类名全部走 `isStandard` 三元拆分；standard 渲染与重设计前字节级一致（冒烟以 git HEAD 旧版组件渲染对比验证）。验证：`tmp/opencode/p18c46redesign-ssr/`（54 断言 0 失败 + 9 入口回归编译；old-bar.cjs 需 `external:['react','react-dom']` 共享宿主 React 否则 Invalid hook call）；tsc 43 错与基线逐条一致 0 新错。④ **P18C46FIX_BTN 按钮微修（2026-08-29，依 `P18C46FIX_BTN_BRIEF.md`；另后续修正 5/6 已调文字+箭头居中并去箭头）**：非 standard 分支 buyClass 仅一处微调——`text-sm`→`text-base`（字号放大）+ 新增 `leading-none`（文字垂直居中，消除行高偏移）+ `[text-shadow]` 垂直偏移 1px→0（改 `0_0_2px`，仅留可读性阴影）；透明底/描边/白字/hover 填充/600ms/圆角 11px/8.5em×2.9em 全部不动；standard 分支与 shop 组件继续零改动。验证：`tmp/opencode/p18c46fix-btn-ssr/`（39 断言 0 失败 + 回归编译）；tsc 43 错与基线一致 0 新错。

- **tweet 主题 7 项优化（P18TWEET，2026-08-29，依 `P18TWEET_BRIEF.md`）**：① 文案——卡片作者徽章/Profile 小节「作者」→「站长」（`TweetPostCardAuthor.tsx`/`TweetProfileCard.tsx`；P18TWEETFIX 起卡片作者徽章已删除，Profile 文案不变）；服务菜单「使用说明」→「站长说明」（`TweetServiceCard.tsx`，链接仍 `/announcement`）。② 导航——顶部导航删「关于」项（`tweet-header__nav-about` 类与 CSS 已移除）；`TweetServiceCard` 新增「关于本站」项（`AiOutlineInfoCircle`，链接 `/about`，位于「下载说明」下方、「更多内容」上方；菜单现为站长说明/下载说明/关于本站/更多内容 4 项，移动端展开面板同源生效）。③ 分类胶囊（**P18TWEETFIX 起卡片分类胶囊已删除**）——`tweetCategoryColor.ts` 曾新导出 `tweetCategoryRgbTriple`（"R G B" 三元组）供卡片分类胶囊注入；该导出现无消费方（文件保留）。④ 卡片 tag 暖色系色板——新 `tweetTagColor.ts`（5 色：琥珀/蜜橙/玫粉/藕紫/奶油金，按 tag 名 charCode 哈希稳定取色），tag 注入 `--tweet-tag-rgb`/`--tweet-tag-ink`；CSS 浅色主题=色板 0.16 淡底+墨色文字、深色主题（含 tweet-dark）=0.14 淡底+`rgba(255,255,255,.82)` 低饱和白字；**tweet-light 旧蓝底蓝字规则已删除**；左栏 `tweet-tags__item` 导航标签样式不动。⑤ 右栏滚动协同（**P18TWEETFIX 已重构为右栏固定+栏内滚动，见下条**）——旧实现为 `.tweet-feed__right` sticky + inner `max-height+overflow-y:auto+隐藏滚动条`：栏内容超视口时冻结在顶部仅显示上段、页面滚动不联动、底部件不可达；新结构三层：aside（网格项，默认 stretch 铺满轨道，JS 写 `min-height=内容高` 保证短页面也有滚动行程）> `.tweet-feed__right-sticky`（sticky top=导航高，max-height=视口余量）> `.tweet-feed__right-inner`（自然高度，撤销内部滚动，`translateY` 由新组件 `TweetAsideScrollSync.tsx` 按页面滚动进度 clamp(0..travel) 位移，rAF 节流+ResizeObserver+matchMedia 1024 守卫，移动端自动还原）；内容不超视口时位移恒 0 纯 CSS sticky（与旧行为一致），超视口时与瀑布 1:1 同步下移、栏底对齐后锁定、页面滚到底右栏底部恰好完全展现；**左栏 tag 列表保持旧 sticky+内部滚动不变**。验证：`tmp/opencode/p18tweet-ssr/`（54 断言 0 失败 + tweet/gallery/shop 15 入口回归编译）；tsc 43 错与基线逐条一致 0 新错。
- **tweet 滚动协同修正 + 卡片头重构（P18TWEETFIX，2026-08-29，依 `P18TWEETFIX_BRIEF.md`，用户截图验收后修正）**：① 滚动协同改向——**删除 `TweetAsideScrollSync.tsx`**（JS translateY 位移方案整体废弃，方向反了导致右栏滚出视口），`TweetHeader.tsx` 右栏改纯 CSS 两层：`.tweet-feed__right-sticky`（`position:sticky; top:var(--tweet-sticky-top); display:flex; flex-direction:column; max-height:calc(100dvh - var(--tweet-sticky-top))`）> `.tweet-feed__right-inner`（`overflow-y:auto; overscroll-behavior:auto` + `scrollbar-width:thin`/webkit 细滚动条**可见**）；页面滚动时右栏 sticky 固定不动，栏内容超视口时在栏内滚动（底部 Contact/社媒可达）；aside 保持 stretch、`<1024px` 隐藏、左栏旧 sticky+内部滚动结构均不变。② 卡片头重构（`TweetPostCard.tsx`/`TweetPostCardAuthor.tsx`）——删除：站长徽章、分类胶囊（`tweet-post-card__category` 及其全部 CSS 含 light/dark 变体）、分享按钮（**删除 `TweetPostCardShare.tsx`** 及其 CSS）；新布局：**行1**=Logo+站名（`text-overflow:ellipsis` 单行省略）+Tags（原徽章位置右侧 `.tweet-post-card__header-tags`：单行 nowrap、`max-width:70%`+overflow hidden、SSR 确定性最多展示 2 个+中性 `+N` 折叠，复用 P18TWEET-4 暖色 tag 胶囊与色板变量）；**行2**=标题（左，`flex:1`+`min-width:0` 可换行）+发布日期（右，baseline 对齐，`.tweet-post-card__title-row`）；卡片底部 tags 行（`tweet-post-card__tags` 容器）删除；摘要/封面/阅读全文不动。验证：`tmp/opencode/p18tweetfix-ssr/`（53 断言 0 失败 + registry/接线页/gallery/shop 回归编译）；tsc 43 错与基线一致 0 新错。
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
- **广告位**：**内页广告位**（`gallery-ad`）、**弹窗广告**（`popup-ad`）、**遮罩广告**（`click-ad`）。
- `Widget` 与 `Ads` 的 `getFilteredPosts` 均清空 Notion 行，只渲染硬编码入口。

### 公告弹窗与广告位约定

- **广告位为专业版权益（P4-FIX，2026-08-24）**：`gallery-ad` / `popup-ad` / `click-ad` 三个广告位仅专业版（`plan === 'pro'`）可用。免费版读者端一律不渲染（`withNavFooterStaticProps` 不下发 popupAd/clickAd、`loadGalleryAdBanner` 返回 null、`SitePopups` 客户端按 `SitePlanContext` 防御性不渲染，无论有无存量配置）；旧过渡期 `freeTierGrace.ts` 已删除，不得恢复。公告弹窗（站务通知）不受套餐限制。管理端不做隐藏：BLOG 后台「广告位」三视图对免费版**灰态可见**（输入/按钮全部 disabled + 顶部「广告位为专业版权益，升级后可用」提示；保存/清空/上传 handler 有 `adsLocked` 防绕过守卫）；plan 来自 `GET /api/admin/site-plan`（只读），读取失败按免费版安全缺省。
- `announcement-popup` 定位为**站务通知**，不是广告：前台无 CTA 跳转按钮，无「通知」类标签；布局为标题栏 + 正文/可选附图 + 底部全宽「知道了」；正文内 URL 自动链接触可保留。
- 前台浅色：`gallery`、`tweet-light`、standard 的 `html:not(.dark)`；深色：`tweet`、`tweet-dark`、standard 的 `html.dark`。
- 关闭后用 `sessionStorage` + 内容 hash，同会话同内容不再弹；内容变更后会再弹。
- `gallery-ad` 后台有开启/关闭开关（Notion `status`）；关闭后前台不渲染。文章页全主题生效（`GalleryAdBanner` / `TweetAdBanner` / `StandardAdBanner`）；下载页广告目前仅 Gallery。
- `popup-ad` 为营销弹窗：主图 + 标题 + 文案 + CTA；**仅首页**进入时弹出；`sessionStorage` 键 `popup-ad:session-shown` 每浏览器会话一次；与公告同时开启时由 `SitePopups` 先公告、关闭后再弹广告。
- `click-ad` 为首页遮罩广告：开启后访客在首页第一次有效点击时，原点击照常进行，同时 `window.open` 新标签打开广告链接；`localStorage` 键 `click-ad:day:YYYY-MM-DD` 每天一次；排除贩售机（`data-blog-vending="1"`）以及公告/弹窗广告 UI。
- 公告弹窗深色适配：standard / tweet-dark 为纯黑面板；tweet（灰色）为灰阶深色；浅色主题（gallery / tweet-light / standard light）保持白底。
- 前台挂载：`withNavFooter` → `SitePopups`（公告 + 弹窗广告 + 遮罩广告捕获）。

### 后台核心 API

| 接口 | 作用 |
|------|------|
| `GET /api/admin/posts` | 全量分页拉 Notion；组装文章/页面/系统配置、分类标签；封面结合 Gallery feed；支持 `syncSlug`/`syncId` 轻量索引检查 |
| `GET/POST/PATCH/DELETE /api/admin/post` | 读/建/改/归档；结构化块与 Markdown 转 blocks；置顶、收藏、Post/Piece、主题配置保存 |
| `GET/POST /api/admin/gallery` | 单篇图库元数据读写（Supabase） |
| `GET /api/admin/gallery-storage` | 站点图库容量 |
| `POST /api/admin/upload` | 服务端代理上传到兰空；路由内用 `verifyAdminRequest` 校验 Basic / `internal_auth` Cookie，失败在读取 Token、请求体和转发前返回 401 |
| `GET /api/image-host-config` | 公开只读、`no-store` 的当前图床公开配置；只返回 version、public origin 与 legacy origins，不返回上传 origin、Token 或 service role |
| `GET/POST/DELETE /api/admin/gallery-ad` | 内页广告条（后台在「广告位」Tab；支持 enabled 开关） |
| `GET/POST /api/admin/friends` | 友链读写（friends 子库） |
| `POST /api/admin/friends/batch` | 批量 upsert，可按 URL 去重 |
| `POST /api/admin/friends/hide` | 按 URL 隐藏（优先 `status=Hidden`） |
| `GET/POST /api/admin/vending` | 贩售机配置 |
| `GET/POST /api/admin/announcement-popup` | 公告通知弹窗配置（无跳转按钮；保存清空旧 button 字段） |
| `GET/POST /api/admin/popup-ad` | 首页弹窗广告配置（CTA 必填链接；会话一次） |
| `GET/POST /api/admin/click-ad` | 首页遮罩广告配置（URL 必填；每天一次；排除贩售机） |
| `GET /api/admin/site-plan` | 站点会员计划只读（P4-FIX 广告位灰态判定；仅 BLOG 后台浏览器调用，只返回 plan） |
| `GET /api/admin/merchant-products` | 主站商户商品列表代理（P18-C1 建立；P18-C3 起后台不再调用，文件保留；路由内 `verifyAdminRequest`；前台 `ShopProductsSection` 改走公开端点 `/api/shop/products`） |
| `GET /api/admin/merchant-product-lookup?sku=` | 主站商品码查询代理（P18C45FIX B2；路由内 `verifyAdminRequest`；8s 超时；响应字段白名单 sku/name/price/status，token 零暴露；Step7「添加商品信息」弹窗数据源） |
| `GET/POST /api/admin/social-links` | 社媒组件配置 |
| `GET/POST /api/admin/content-protect` | P14 内容保护开关；GET 公开只读（读者端 `_app` 挂载后拉取，`no-store`，未配置/018 未执行安全缺省 false）；POST 路由内 `verifyAdminRequest` + 维护密码豁免，写 `blog_site_settings.content_protect`（update→无行 upsert），仅写该列 |
| `GET/POST /api/admin/banner` | shop 首页 Banner 配置（P18-C4-1；路由内 `verifyAdminRequest`，未登录 401；图片最多 8 张，开启时必须有图；P18C43-D1 起保存成功后服务端即时 `revalidateMany(['/'], clearCaches+warmPaths)` 含首页预热并回执 `revalidated`，失败不回滚保存；后台另有客户端 `runBatchedRevalidation(listScope='banner')` 兜底） |
| `GET /api/admin/theme-cooldown` | 主题切换配额状态（命名历史遗留） |
| `POST /api/admin/revalidate` | ISR 刷新；支持即时刷新与 `action: drain` 消费队列 |
| `GET/POST /api/admin/full-redeploy` | 全量 redeploy（Deploy Hook + 冷却） |
| `DELETE/PATCH /api/admin/taxonomy` | 删除标签/分类或重命名分类 |
| `GET/POST /api/admin/config` | 读/改 Notion 数据库标题（站点名）等相关配置 |

### Admin API 鉴权边界（P3.0）

- `src/middleware.ts` 的 matcher 虽包含 `/api/admin/:path*`，但当前实现分支只判断 `pathname.startsWith('/admin')`；因此不能仅凭路由名称或 matcher 认定全部 Admin API 已受 middleware 保护。
- `/api/admin/upload` 是浏览器后台专用敏感接口，已在路由内调用 `verifyAdminRequest(req)`；未登录或错误凭据返回 401，并且不会读取 `LSKY_TOKEN`、请求体或转发兰空。`npm run test:upload-auth` 覆盖未登录、错误 Basic、正确 Basic 与正确 Cookie。
- `/api/admin/crawler-ingest` 也已有路由内 `verifyAdminRequest`，敏感操作再叠加维护密码。
- 当前代码调用盘点中，`posts`、`post`、`gallery*`、`upload`、`gallery-ad`、`popup-ad`、`click-ad`、`social-links`、`theme-cooldown`、`config`、`taxonomy`、`full-redeploy`、`crawler-ingest`、`site-plan`、`banner`、`merchant-product-lookup` 只在 BLOG 后台浏览器使用；`friends*`、`announcement-popup`、`vending`、`revalidate` 同时被平台服务端调用。
- 平台目前会服务端调用 `/api/admin/friends*`、`/api/admin/announcement-popup`、`/api/admin/vending` 与 `/api/admin/revalidate`，这些调用尚未统一携带 BLOG Basic/Cookie。未设计并部署明确的服务到服务凭据前，禁止把 middleware 分支直接扩大到全部 `/api/admin/*`，否则会破坏现有组件同步。
- 长期目标仍是按调用方分类：浏览器后台接口使用管理员会话，平台联动接口使用独立服务端鉴权，公开只读能力放在非 admin 路由；不得继续依赖匿名 Admin API。

### 维护密码锁

- 共用工具：`src/lib/admin/maintenancePassword.js`
- 优先读 `ADMIN_MAINTENANCE_PASSWORD`，兼容 `ADMIN_FULL_REDEPLOY_PASSWORD`，默认兜底 `123456.`
- 覆盖：爬虫管理、全量更新、贩售机地址编辑（改 title/url）
- 单独切换贩售机 `enabled` 不需要维护密码
- 请求侧常见字段/头：`password`、`x-admin-maintenance-password`、`x-full-redeploy-password`

### 保存、媒体与发布约定

- 编辑器结构化块会转为 Notion blocks；加密内容使用 `LOCK:<password>` callout 协议。
- 编辑器块类型：`h1`/`text`/`quote`/`note`/`link`/`image`/`lock` + `ol`（有序）/`ul`（无序）/`todo`（待办）/`toggle`（折叠）。列表块 `content` 每行一项；`todo` 另有 `checked` 数组（按行），导出为 `numbered_list_item`/`bulleted_list_item`/`to_do`，导入时相邻同类型列表项自动合并；`serializeBlocksForSave` 白名单不含 `checked`，保存路径在 AdminDashboard 调用处按原块补回。锁块内列表以行首 `1. ` / `- ` / `[ ] ` / `[x] ` 前缀往返（`styledLinesToChildren` 识别）。
- `toggle`（折叠块，Phase5 加）：`content` 为**行数组**，第 1 行是折叠标题、其余行是展开后的子内容（纯文本行）；导出为 Notion `toggle` 块（标题行 → rich_text，其余行 → children 每行一个 `paragraph`）；导入时读取 children 中 `paragraph` 逐行保留（含空行），其他子块类型降级取首个文本行。
- `code` 块已移除（Phase5 曾加入，用户拍板删除）：后台不再产生 code 块；Notion 中已有的 code 块导入时**降级为 `text` 块**（代码全文含换行保留、language 丢弃）；前台对 Notion 原生 code 块的渲染保留。
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
- **自动注入**：`discoverSocialLinksDb` 检测到主库缺少 `slug=social-links` 且 `type=Widget` 的页面，或该页面内部缺少社交媒体子数据库时，会自动创建（建 Widget 页面 + 建子数据库 + 补齐 platform/url/status 字段），社媒组件开箱即用，无需手动在 Notion 建数据。

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
API 层的 `verifyAdminRequest(req)` 目前明确用于 `/api/admin/upload` 和 `/api/admin/crawler-ingest`；其他 Admin API 不能假定已有二次校验。敏感操作另加维护密码。

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
| `migrations/012_image_host_governance.sql` | 全平台共享图床单例、审计事件、原子激活/回滚 RPC（P3 已生产验收） |
| `migrations/018_blog_site_settings_content_protect.sql` | P14 内容保护开关列 `content_protect`（+preflight/verify 脚本） |

### 内容保护开关（P14，2026-08-27）

- 站级开关存 `blog_site_settings.content_protect`（migration 018；未执行时 API 降级 false）。
- 前台注入：`_app.tsx` 仅非 admin 路由挂载 `ContentProtectGuard`，客户端拉取 `GET /api/admin/content-protect`（公开只读）；`enabled=false` 时零副作用。
- 防护行为（`src/lib/protection/contentProtectDom.ts`，可逆）：`contextmenu` 全站**静默**拦截（P14FIX 用户拍板：不弹提示条）；`copy`/`cut`/`dragstart` 拦截但 input/textarea/contentEditable 放行；全站 `img` draggable=false（MutationObserver 维护新增图片）+ 注入 `-webkit-user-drag:none` 样式；图库 lightbox 点击查看不受影响；`/admin` 不受影响。
- 后台：「组件」Tab「内容保护」卡；保存即写库，读者端下次访问生效（客户端运行时行为，不走 revalidate）。
- 自测：`npm run test:content-protect`（API 鉴权/读写 stub + 注入开启/关闭分支 + detach 可逆）。

### 图床共享配置治理（P3 已生产验收，P5 已上线，P6 version=2 已激活）

- 图床域名是全平台共享基础设施，不按 `BLOG_SITE_ID` 复制到每个站点；共享库使用单例 `blog_image_host_config(id=1)` 保存 `upload_api_origin`、`public_asset_origin`、`legacy_asset_origins` 和单调递增 `version`。
- 初始配置历史状态是：上传与公开 origin 都为 `https://img.x1file.top`，历史 origin 为空。2026-08-12 已由平台 Admin 激活 version=2：上传/公开 origin 为 `https://img.vlogs.cc`，历史 origin 包含 `https://img.x1file.top`。
- 每次激活/回滚通过 `activate_blog_image_host_config` / `rollback_blog_image_host_config` 完成；使用 `expected_version + FOR UPDATE` 防并发覆盖，同一事务更新配置并写 `blog_image_host_events`。回滚恢复上一事件快照的配置内容，但版本号继续递增。
- `anon` / `authenticated` 不得直接读取、写入配置或事件，也不得执行 RPC；`service_role` 只允许读取两张表和执行两个受控 RPC，不授予直接 INSERT/UPDATE/DELETE，避免绕过审计。
- origin 只接受规范化 HTTPS 域名，可带合法端口，不接受 path/query/hash/userinfo/IP；历史 origin 会规范化、去重，公开 origin 变化时自动保留前一个公开 origin。
- 候选验活摘要必须是小型 JSON object，不得包含 token、cookie、authorization、password、secret 等疑似敏感字段；配置表不保存兰空、FRP、ClouDNS 或其他 Token。
- 数据库执行顺序固定为：`supabase/scripts/preflight-image-host-governance-p3.sql` → `supabase/migrations/012_image_host_governance.sql` → `supabase/scripts/verify-image-host-governance-p3.sql`。2026-08-09 生产已按 revision `20260809-image-host-p3-v1` 完成，preflight 与 verify 均返回 `ready=true`；正式初始态仍为 version=1、旧域名、空历史 origin、空事件表。
- 迁移后 Supabase Advisor 未发现 P3 函数暴露或可变 `search_path`；两张表的 `RLS enabled no policy` INFO 是有意默认拒绝，事件时间索引的 `unused index` INFO 是 P4 尚未读取事件时的预期状态。不要为消除 INFO 添加浏览器 Policy 或删除后续审计查询所需索引。
- P5 运行时实现位于 `src/lib/media/imageHostConfig.ts` 与 `rewriteManagedAssetUrl.ts`：服务端读取共享单例并使用 15 秒短缓存；读取异常优先使用 last-known-good，冷启动且不可读时回退 `LSKY_URL`，再回退 `https://img.x1file.top`。日志不得包含凭据或响应正文。
- `/api/admin/upload` 仍先做路由内管理员鉴权；通过后才读取共享配置和 `LSKY_TOKEN`，上传到当前 `upload_api_origin`，并仅接受当前上传/公开/历史允许名单中的兰空返回 URL，保存前统一为 `public_asset_origin`。失败响应不再向浏览器透传兰空原始正文。
- Notion cover、页面图标、正文图片/视频、Widget、站点 logo、友链头像、公告/广告、Gallery `url`/`thumb_url`/feed、爬虫入库与 SEO 上游均在数据格式化或保存层执行精确 origin 映射；只替换 `legacy_asset_origins` 中完全相等的 origin，保留 path/query/hash，不修改任意第三方 URL、普通文本或链接。
- `GET /api/image-host-config` 只公开 `version`、`public_asset_origin`、`legacy_asset_origins` 并强制 `no-store`；`ImageHostAssetBridge` 在 hydration 后只修正 `img/source/video` 的 `src`、`srcset`、`poster`，用于尚未完成 ISR 的旧 HTML，不扫描正文文本、不修改 `<a href>`，也不能替代服务端映射。
- `site-config`/内容刷新会清除图床短缓存但保留 LKG，下一次读取重新访问共享库。当前 version=2 已确认使旧图输出映射到 `img.vlogs.cc`，新文章上传也使用新 origin；旧 `img.x1file.top` 必须继续在线。平台写闸门只控制后续 mutation，不决定 BLOG 当前读取哪个版本。
- 后台 `GalleryManager` 缩略图顶部只保留序号和删除按钮；不显示“待发布”或顶部小型“封面”。非封面图片在底部显示蓝色全宽“设为封面”，当前封面继续显示自动/手动状态和必要的“取消设定”。二次打开文章后必须仍可改选封面并保存。

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
| `LSKY_TOKEN` / `LSKY_URL` / `LSKY_MAX_UPLOAD_MB` | 兰空图床；`LSKY_URL` 仅为共享配置不可读时的兼容回退，不再用于日常切换 |
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
| `MERCHANT_API_BASE` | 主站网关地址（shop「关联商品」下拉代理；未配置则降级手填 SKU） |
| `MERCHANT_PRODUCTS_PATH` | 主站商品列表端点路径（默认 `/api/merchant/products-public`） |
| `MERCHANT_API_TOKEN` | 主站服务端凭据（可选，Bearer 透传） |
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

## 19.5 UI 设计质量约定（用户拍板 2026-08-23，BLOG/系统侧所有 UI 改动执行）

> 项目已附带 `impeccable` 与 `design-taste-frontend` 两个设计 skill（`.agents/skills/`），做 UI 时参考其原则；以下为提炼后的硬性约定：

1. **主题适配**：任何 UI（含弹窗/遮罩/输入框/按钮）必须随站点主题亮/暗色调（Tailwind `dark:` 变体、主题 class 或 CSS 变量），禁止硬编码单一深色/浅色面板；浅色主题下不得出现黑色系面板。
2. **文案精简**：用户可见文案无技术栈关键字、少文字少配文（见 ui-copy-rules）；按钮/标题用纯功能性文字，不带 emoji 装饰（特殊图标除外）。
3. **层次与间距**：统一间距节奏（4/8px 体系），一行一重点；文本层次（标题/正文/辅助说明）分明，禁止文字堆叠与过度装饰。
4. **克制动效**：过渡 0.15–0.3s、ease-out；hover/active 反馈轻微（微亮/微浮/回缩），禁止炫技动画，除非用户明确要求。
5. **一致性**：同类型控件（按钮/输入框/弹窗/徽标）在全部页面与主题下样式统一；同一弹窗风格全站一致。
6. **状态反馈**：loading/error/空状态有明确但克制的提示，不静默失败。

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
- 图床：`npm run test:image-host` 必须通过鉴权顺序、origin/允许名单、path/query/hash、异常配置与上传返回规范化；Gallery 封面改动另跑 `npm run test:gallery-cover`；再执行针对性 ESLint、`npx tsc --noEmit`（区分既有基线）和生产构建。
- 内容保护：`npm run test:content-protect` 必须通过 GET 公开只读缺省、POST 鉴权（Basic/Cookie/维护密码豁免）、update→upsert 读写、列缺失降级与注入开启/关闭/detach 可逆分支。

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
- `/api/admin/*` 的 matcher 不等于真实鉴权；新增或修改 Admin API 时必须明确记录浏览器、平台服务或公共调用方，并在路由层选择对应鉴权。

---

## 22. 文档维护约定

每次完成关键功能节点后，至少检查并更新本文件中对应章节：

1. 新增/变更的 API、Widget、slug、环境变量
2. 前后台数据流与 revalidate 行为
3. Supabase 表/迁移与降级路径
4. 安全边界与已知陷阱
5. 验证方式

若某能力“库已实现但未接线”，必须明确写出，避免后续误判为已上线。
