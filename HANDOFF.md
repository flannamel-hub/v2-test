# BLOG(v2-test)交接文档(HANDOFF)

> 更新日期:2026-08-29 ｜ 用途:新对话/新开发者快速接手。正式规范以 `AGENTS.md` 为准(AGENTS 受保护,关键节点需确认后同步)。

## 1. 我们在做什么
Notion 驱动的 BLOG SaaS(前台 Next.js 13 Pages Router + Notion 数据源 + Supabase 多租户 + 兰空图床),多主题(standard/anzifan、gallery、tweet/light/dark、shop v1/v2)。核心联动:店铺商品关联(Step7 商品码),主题化商城展示。

## 2. P18 商品关联(核心新增,2026-08-27~29)
| 环节 | 位置/行为 |
|---|---|
| Step7 弹窗 | 「＋添加商品信息」(蓝色实体按钮)→ 输入商品码 → `/api/admin/merchant-product-lookup` 代理查系统(名称/价/状态当场显示,蓝色界面)→ 确认写表单 |
| 保存(post.js) | 服务端权威查询:查到写 `linked_product_url/price/name`(列自动补建);查不到**保留 sku 清 url/price**;清空商品码=三字段联动清空 |
| 前台(shop) | 卡片=商品样式(sku 非空即渲染;价格「暂无」;无链接点击弹「当前不可购买」居中窗);购物车按钮:加购后变**「查看购物车」文字+红角标**→点击开抽屉(数量只在窗内 ±,重复加购 confirm);内页 ArticleProductBuyBar(standard=绿条 / tweet·gallery=蓝描边 Uiverse 按钮) |
| 跨域购物车 | `buildCheckoutUrl`:`store/cart?site=&items=sku:qty:price:name&site_title=`(name encode 清洗`,:;&`→空格);store 空组幂等导入 |

## 3. shop 主题
- **shop v1**:商品卡网格(分类/tags/等高/立即购买+购物车/「暂无」价格);归档=**商品中心**(独角数卡侧栏 248px/居中大标题/搜索商品名称/省略号分页 首尾页+±2窗口);Banner(保存即 revalidate、箭头删、圆点底部居中、1000ms 过渡)。
- **shop v2**:首页**单列大卡**(封面=Banner 同高比例 min-h 200/240/320/420,底部单行:标题·价格胶囊·立即购买+购物车;4 张/页;全内容复用车)。
- 主题名:「shop v1」「shop v2」;`isShopTheme` 统一兼容(导航/footer/Banner)。

## 4. tweet 主题(2026-08-29 大修)
- 卡片:仅一行头部=**文章标题(1.25rem/600)+日期(行尾)**,Tags 下一行**全部显示**(暖色板 `tweetTagColor`);无站名/头像/分类徽章/分享;
- 右栏:纯 CSS sticky 固定+栏内滚动(滚动条隐藏)+**滚动接力**(`useTweetSidebarScrollChain` wheel 决策表:文档到底→滚轮转右栏,向上滚右栏先回顶;守卫:左栏/右栏内/ctrl/移动端);
- 文案:站长徽章/右侧 Profile「站长」/菜单「关于本站」(下载说明下/更多上)/「站长说明」。

## 5. 其他要点
- 封面三保险:Notion cover → Supabase 图库首图 → 正文首图(post-cover API 懒加载);保存时服务端兜底(cover 空取正文首图)。
- 图床兰空单实例;**防盗链已停用**(备份 .bak-antilink;P16 同步工具停用跳过)。
- 编辑:图片仅发布队列真实上传;代码块已移除(降 text);Banner 上传=拖拽缩略图网格(132×74)。
- env:3 站×4(MERCHANT_API_*/BLOG_SITE_ID/GALLERY_QUOTA_GB 等由系统侧 pushBlogSiteEnvToVercel 自动注入;za29ow 事故后已修复);店铺名/查单入口等详见代码。

## 6. 最近批次速查
- 2026-08-29:TWEETCARD(重设计)/TWEETSCROLL(接力)/STORE(name 字段链接)/buypage(重设计)…
- 详细节点见 AGENTS.md §7(shop/tweet)与 §8(API/Widget 表)。

## R16 — 后台新手聚焦引导（2026-09-19，上线并真机 E2E）

- `src/components/blog-manager/OnboardingTour.js` 新建：零依赖 portal 挖孔引导（5 步；Esc/跳过/完成；目标缺失自动跳步；resize/scroll 重算；reduced-motion 降级）。
- `AdminDashboard.js`：五处 `data-tour` 锚点（site-info/publish/tabs/view-tools=右簇/gallery-bar）；齿轮「新手引导」→ 重放；mount 读 `?tour=1`（≥768px）→ `replaceState` 清参 → 600ms 自动弹；关闭（完成/跳过/Esc）→ `POST /api/admin/onboarding-seen`（best-effort）。
- 新 `src/pages/api/admin/onboarding-seen.ts`：verifyAdminRequest + 服务端调主站 `/api/merchant/blog-tour-seen`（Bearer 仅服务端，8s 超时）。
- 标记在主站 `merchant_services.blog_admin_tour_seen_at`（仅首次进入 + 关闭后写入；已写过幂等）。middleware 零改动（tour 参数天然存活）。
- 验证：esbuild 编译 ✓ / tsc 43 基线 0 新错；真机 7 项全过（自动弹/五步文案/完成/不重复/齿轮重放/手机不弹/DB 标记）。

## R16F — 引导四处修正（2026-09-19，上线并真机验收）

用户验收反馈 4 点修复（提交 `b68e5633`，部署 z4sobc）：
- **F1 就绪后才弹**：门控改为 `!loading && (posts.length>0 || firstDataLoadDoneRef.current) && !galleryStorageLoading`；`firstDataLoadDoneRef` 在首拉取 finally 置位（覆盖空站）；就绪后 300ms 弹、200ms 轮询、10s 兜底（有锚点才弹）。实测时间线：1.4s 仍在「正在加载后台」→ 无引导；内容就绪(2.5s)后 → 6.8s 弹出（等图库容量）✓。
- **F2 缩放重对准**：`repositionStep`（scrollIntoView→双 rAF→测量）+ resize 150ms 尾部防抖 + ResizeObserver（锚点/容器）；实测步骤 4 于 1500→1080→1500 缩放，高亮与锚点偏差 dl/dt/dw = 0 ✓。
- **F3 六步+主题步**：文案逐字按用户稿（第 3 步删主题、新增第 6 步 theme-switch=主题切换器左簇按钮，锚点 `data-tour="theme-switch"`）✓。
- 验收全过：6 步文案逐字、完成→DB 标记写入（23:19:32）、刷新不弹、齿轮重放+跳过、<768px 不弹；**测试站标记已复位**（用户下次进入仍会弹）。
- 坑：R2 模板包下载 curl 是原生程序，`-o` 输出路径必须 Windows 式（`$LOCALAPPDATA/...`），MSYS `/c/...` 会 write error；上传脚本已加空目录护栏（文件数异常直接 abort，避免空部署）。
