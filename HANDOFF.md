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

## R16G — 引导扩展至 10 步 + 第 10 步强制点击交互步（2026-09-19，上线并真机验收）

用户设计：7=刷新按钮、8=草稿箱、9=垃圾箱（各步新文案）、10=再次聚焦「发布新内容」并**强制点击**（气泡无按钮不可点 + 点击引导动画；点了即进编辑器并结束引导，为后续「编辑界面引导」衔接铺设）。
- **提交** `47c80e75`；`OnboardingTour.js`：TOUR_STEPS +4（文案逐字）；交互步 `interactive:true` 渲染分支——容器 pointerEvents none、挖孔外 4 捕获层防误触、呼吸光晕+双错相涟漪（keyframes 注入 style，r16tour- 前缀，reduced-motion 降级）、目标按钮 capture click→closeRef（不 preventDefault）、Esc 屏蔽、锚点缺失即关。
- **AdminDashboard**：新锚点 `drafts`（草稿箱按钮）`refresh`（包 AdminRefreshButton 的 span）`trash`（回收站按钮）。
- **真机 10/10**：每步文案逐字+按钮态正确；第 10 步无按钮；**坐标点击穿透**（click_at_xy 打真实按钮）→ 引导 CLOSED + 编辑器打开（正文标题等标记出现）+ 标记写入（23:47:31）✓；测后标记已复位。
- 后续：用户将先调整文章编辑界面 UI，再设计编辑界面聚焦引导（第 10 步点击后自然衔接）。

## R17 — 文章编辑界面优化（2026-09-19，上线并真机验收）

拍板 1A/2A/3A/4A；红线=编辑器界面层优化、正文区块重逻辑零触碰。
- **A 步骤重组（7步→5步）**：1 基础信息（标题/摘要/发布日期〔从 Step2 移入〕/访问密码；去「必填」胶囊）→ 2 分类和标签（标签块并入；简单页面整步隐藏）→ 3 文章封面（仅封面说明文本；删 BlockCoverHint/启用默认封面/手动添加封面 + 相关 state/handler/import 5 成员，**setCoverSettings 行全保留、coverSettings 链零改动**）→ 4 图库（+「可选」灰胶囊 + 问号气泡）→ 5 下载链接（仅编号）。附件步删除 → 见 C。
- **B 正文区**：正文区域白色加粗；块按钮 5列grid 两排×5（一排 h1/text/image/link/加密盒子；二排 引用/注释/有序/无序/折叠内容）；移除待办列表新增入口（工具栏+BLOCK_TYPE_OPTIONS；**todo 类型渲染/编辑/保存全保留**）；改名入 toolbar+选项表+块头标签映射三处。
- **C 按钮化**：附件步 → 「添加附件下载」蓝色同款按钮+弹窗（maxHeight 80vh 滚动，AttachmentManager 零改动），位于「已关联商品」卡之下、绑定商品信息按钮之上（间距 10px）；商品按钮改文案「绑定商品信息」+弹窗标题同步；新增 HintBubble 组件（15px ?/fixed 定位防裁剪/hover+点按+点外关闭/z10000）三处复用。
- **D 发布校验**：底部按钮常亮（仅 loading 禁用）；attemptSave 缺项 → 新 MissingFieldsModal（还有必填项未完成 + 逐条缺项红星 + 「去填写」→ 展开步骤并 scrollIntoView；StepAccordion 加 data-editor-step）；组件编辑器分支同改；存草稿链零改动。
- **R17F（850803c2）验收修复**：HintBubble 点按路径补 computePos（原只 toggle open，未 hover 时 pos 为 null → 触屏点按不显示；验收实测抓到）。
- **真机验收（z4sobc）**：5 步标题/无必填胶囊/Step1 含日期(预填 2026-09-19)/封面仅说明文本/图库可选+气泡/工具栏 5+5+三改名+无待办入口/两按钮顺序蓝色+bubbles 文案/附件弹窗内容/缺项弹窗(文章标题+文章分类)+去填写跳转 Step2/有效路径→发布确认弹窗(取消不发布)/加块回归(内容块+格式化工具渲染正常)/简单页面(介绍页)仅 1 步且日期在 Step1 ✓；三气泡点按全通。测试站标记已复位。

### R17G — 验收反馈修正（2026-09-19，上线并复验，提交 `22ff6c61`）
- **问号气泡**：去圆圈改裸「?」（原 15px 圆+边框 → span role=button/tabIndex，无边框无底，hover 变亮 via CSS 类 `.hint-bubble-icon/.hint-bubble-light`）；「绑定商品信息」按钮的问号从按钮右端 absolute 移入**内容流紧跟文字**（button 不再套 button）；hover/点按/键盘 Enter 均可开气泡。
- **附件回归 Step5**：删蓝色「添加附件下载」按钮+弹窗+attachmentModalOpen；恢复 StepAccordion `step={5}`「附件」+可选灰胶囊（与 step4 同款）+逐字说明文本（上传附件后将在本篇文章页面中提供下载入口，未添加附件则不显示）+AttachmentManager（零改动）；`!editingSimplePage && form.type!=='Widget'` 双条件保持。
- **下载链接 → step6**；缺项弹窗/跳转（1/2 步锚点）不受影响。
- **复验（真机）**：六步标题全对；附件步展开=说明文本+上传附件；底部无蓝色附件按钮、商品按钮问号紧贴文字无圆圈且 hover/click 均出气泡；图库问号同款可用；缺项弹窗正常列出标题/分类。测试站标记已复位。

### R17H — 附件步说明改标题问号气泡（2026-09-19，提交 `ce1f2814`）
- Step5「附件」标题在「可选」胶囊后追加与 Step4 同款裸问号 HintBubble（文案=上传附件后将在本篇文章页面中提供下载入口，未添加附件则不显示）；步骤内容删除说明段，只留 `AttachmentManager`。
- 复验：标题「附件 | 可选 | ?」、问号 border none/color #999 与 Step4 一致、hover 出正确气泡、展开内容=上传附件（无说明段）。测试站标记已复位。

### R17I — Step6 下载链接加可选+问号；标题问号改圆圈居中（2026-09-19）
- Step6 标题=下载链接+(Gallery主题专用)+可选灰胶囊+问号（文案：gallery主题会默认开启下载链接分享按钮，非gallery主题无需填写。）；HintBubble 图标改回 16px 圆圈（border-box+flex 双居中+lineHeight 1，?' 居中），hover 颜色+边框变亮。用户直接验收。

## R18 — 编辑器聚焦引导（14 步）+ 首页连续链 + 恭喜弹窗（2026-09-19，上线并全场景验收）

- **主站（`b893ef0c`，迁移先落库）**：`merchant_services.blog_editor_tour_seen_at` 新列；`/api/merchant/blog-tour-seen` body 增 `kind`（home/editor 分列、只写一次）；登录链接 `createBlogAdminLoginLink` 同时读两列 → 追加 `&tour=1`/`&etour=1`（fail-safe 不变）。
- **BLOG（`f375bd23`）**：OnboardingTour 增 `onStepChange(index,step)`、`onClose(reason)`（skip/done/interactive）、长目标 `block:'start'`+气泡顶部内侧、+300ms 步进复测（首页 10 步行为零改动）；`EDITOR_TOUR_STEPS` 14 步（文案按 §四）+ 动作表（0=全收起/1-6=展开 N）; 锚点新增 editor-steps-region/editor-body-region 包裹 div、StepAccordion 根 `data-tour=editor-step-N`、product-btn/block-toolbar/view-toolbar/blocks-area/save-draft/publish；`EditorTourDoneModal.js` 新组件；接线：`?etour=1`→pendingRef、首页 `reason='interactive'`→chainRef、编辑器引导 effect（view=edit+单飞+≥768+锚点轮询5s→清ref→收起→600ms 开）、关闭写 kind:'editor'+全收起、done 才弹恭喜窗、【回到首页】=guardLeaveEditor(leaveEditView)。
- **验收（z4sobc 全场景）**：①首链：链接 tour+etour → 首页 10 步 → 点发布 → 编辑器 14 步接续（每步聚焦时对应 step 展开 469/351/148/290/128px、其余 66px 收起；14 步文案逐条 OK）→ 末步下一步 → 恭喜弹窗 → 回到首页落列表 → 两列标记写入（02:32/02:33）✓；②再进编辑器不弹 ✓；③齿轮重放：首页全链 → 点发布 → 编辑器引导起（无视标记）→ 跳过 → 无恭喜窗 + 步骤全收起 ✓。收尾：两列已复位（供用户体验），Edge/凭据/临时包全清。

## R18X — 引导动效编排重做 + 退出确认窗 + 欢迎弹窗 + 回首页定位（2026-09-19，上线并全场景验收）

- **BLOG 侧（`aa6f1c88`）**：
  - `OnboardingTour.js` 视觉层五阶段编排：全亮+动作先行（onStepChange+instant scroll）→ 500ms 布局静置 → 均匀遮罩 0→0.5 + 白描边框 transform 1.12→1 收拢 480ms → holding；步进=退场 350ms 后再动作。box-shadow 挖孔**整体删除**（根源消灭弹跳）；动画仅 transform/opacity；`prefers-reduced-motion` 全过渡 0。
  - 退出三路径（Esc 任意步含交互步 / 左下角「退出新手指引」按钮 / 工具条跳过）→ 统一页内确认窗「是否退出新手指引？」【继续引导】【确认退出】；确认才退出，取消继续。
  - `EditorTourDoneModal.js`：「回到首页」后 window.scrollTo(0,0)+#admin-container.scrollTop=0。
  - `WelcomeTourModal.js`（新）：首进欢迎窗「欢迎使用 BLOG 后台/这里是你的内容发布中心。需要一份新手引导带你快速上手吗？」【不需要】（双写两列标记、不再打扰）【开始指引】（就绪门控后开链条）；齿轮重放直达不经欢迎窗；<768px 不弹。
- **验收（测试站 z4sobc 真机，1500×1150）**：欢迎窗四断言 ✓；不需要→双写(03:08)✓；开始指引→首页引导→点发布→编辑器引导自动接续→14 步走完→恭喜窗→回到首页→**滚动归零 {win:0, cont:0}** ✓；动效三帧（全亮无遮罩/遮罩渐入+描边框/停留态）目检 ✓；退出三路径（按钮/Esc/跳过→确认窗→继续引导/Esc 取消/确认退出）✓；标记双写(03:11)后已复位 null 供验收。
- 主站侧零改动（本单全在 BLOG 侧）。

## R19 — 缩小视图拖拽重制（dnd-kit 标准方案）（2026-09-19，上线并真机验收）

- **拍板**：1A dnd-kit 重制 / 2A 悬浮卡+让位开缝 / 3A 5px 激活阈值 / 4A 自动滚动 / 5A 多选禁拖。
- **BLOG 侧（`c3b14b99`）**：`AdminDashboard.js` ±325 行——新依赖 `@dnd-kit/core ^6.3.1 / sortable ^10.0.0 / utilities ^3.2.2`（package.json + lock 已提交）；`BlockMinimapCard`（纯展示卡，供排序项与幽灵卡共用）+ `BlockMinimapSortableItem`（useSortable，disabled=selectMode，transform/transition/touchAction 自带，拖中 zIndex 10）；`DndContext`（PointerSensor distance:5 + closestCenter）包 `.block-minimap-list`；`DragOverlay zIndex={10040} dropAnimation={null}` 幽灵卡（is-ghost 绿边/投影/缩放 1.04）；`onDragEnd` 按 id 求索引 `arrayMove` + `justMoved` 闪 600ms；`onDragCancel` 兜底；`is-sorting` 时 `+` 行 opacity .3 且 pointer-events none；旧自研 5 态/10 handler/`reorderBlocks` 全删（零残留）；文件拖入分支改名保留（handleMinimapFileDragOver/FileDrop/Container*）；**红区唯一触碰点**：放大视图 onDrop 的 `dragIndex !== null` 守卫删除（行为等价）。
- **验收（z4sobc 真机，CDP 指针级模拟）**：T1 H1 拖到顶部 ✓ 精确落位；T2 拖回 index2 ✓；T3 原地放下无变化 ✓；T4 缝隙释放落在 index1（**未甩末尾**，旧 bug 消除）✓；T5 多选模式拖拽不激活+点选/退出 ✓；T6 纯点击切放大视图 ✓（拖动后不误触缩放 ✓）；文件拖入合成高亮 ✓；**内层容器自动滚动 scrollTop 0→255** ✓；放大视图 5 块卡+上下移按钮基线 ✓；删除钮 ✓。停靠期间改动均未保存（服务端零写入）。
- **工具沉淀**：`scripts/tmp_r19_mint.ts`（pro-merchant-v3）= 免密生成 5 分钟 admin 登录链接（读实例密钥解密+签名，生产同逻辑）；CDP 拖拽模拟要点：move 事件 `button:'none', buttons:1`、必须先 `elementFromPoint` 验证命中（内层 `.block-minimap-scroll` 会裁剪列表且自带滚动——测试前把目标项滚进可视区）。
