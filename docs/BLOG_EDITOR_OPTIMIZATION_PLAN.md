# BLOG 编辑器优化方案与 Phase 计划

> 生成日期:2026-08-18
> 范围:Blog 后台文章编辑器(v2-test)功能完善 + 体验优化 + 数据治理
> 原则:全部需求采纳;复杂任务交 GLM 执行;**任何删除/修改现有重逻辑代码(加密块、块转换、发布流程)前,GLM 必须先输出方案向 Hermes 确认,不得擅自删改**;不破坏已有编辑器功能。

---

## 需求全集(15 项)

### A. 用户整理(8 项)

| # | 需求 | 类型 |
|---|------|------|
| A1 | 文章卡片多选后要有「取消选择」功能 | UI |
| A2 | 创建新文章时所有 Step 折叠(不默认展开 Step1) | UI |
| A3 | Step5 增加「是否开启下载按钮」开关(目前仅 gallery 主题生效) | 功能 |
| A4 | 「Step5 下载信息」改名为「下载链接」 | UI |
| A5 | 文章编辑界面正文区域加虚线边界,标示正文编辑区 | UI |
| A6 | 发布失败任务:提供「恢复到编辑器」「仅重试失败步骤」,长期保留最后一次编辑快照 | 功能 |
| A7 | 图床孤立文件治理:扫描、回收站、延迟清理,至少提供容量统计与清理预览 | 功能/治理 |
| A8 | 未保存修改保护 + 草稿类型:切换页面/关闭后台/误点返回时检测正文、Gallery、封面、分类等未保存变化,提供「继续离开 / 留在编辑器 / 保存到草稿」 | 功能 |

### B. Hermes 审查补充(7 项,用户全部采纳)

| # | 需求 | 类型 |
|---|------|------|
| B1 | 编辑器支持 Notion `toggle`(折叠块)/ `code`(代码块),不再降级为文本丢结构 | 功能 |
| B2 | `beforeunload` 未保存离开提示(并入 A8 实现) | 功能 |
| B3 | localStorage 草稿缓冲(并入 A8 的「保存到草稿」) | 功能 |
| B4 | todo 行内 checkbox 勾选交互(不再靠 `[x]` 前缀) | 体验 |
| B5 | ol/ul/todo 编辑器显示序号/圆点预览 | 体验 |
| B6 | 粘贴 Markdown 自动分块(`1. ` `- ` `# ` 前缀自动转对应块) | 体验 |
| B7 | `blocksToMarkdown` 补 ol/ul/todo 序列化(闭环,防止将来 markdown 路径保存列表退化) | 修复 |

---

## Phase 划分

> 按「风险从低到高、依赖关系」排序。每个 Phase 独立派工、独立验收、独立提交。

### Phase 1 — 快速 UI 小修(低风险,纯前端 UI,不碰逻辑)

| 项 | 内容 | 涉及 |
|----|------|------|
| 1-1 (A1) | 文章卡片多选后提供「取消选择」按钮(退出多选/清空已选) | AdminDashboard.js 列表区 |
| 1-2 (A2) | 新建文章默认 `expandedStep = 0`(全部折叠);编辑已有文章仍默认展开 Step1?→ 保持现状(编辑时展开第一步便于直接改) | AdminDashboard.js `useState(1)` → 按新建/编辑区分 |
| 1-3 (A4) | Step5 标题「下载信息」→「下载链接」(含 `GalleryOnlyTag` 保留) | AdminDashboard.js Step5 标题 |
| 1-4 (A5) | 正文编辑区(blocks 列表容器)加虚线边框样式,视觉区分正文区域 | AdminDashboard.js + admin.css |
| 1-5 (B5) | ol/ul/todo 编辑控件上方加序号/圆点/勾选样式预览行 | AdminDashboard.js 列表块渲染 |

**验收**:后台肉眼检查 4 处 UI 变化;lint/build 通过;不涉及任何保存/转换逻辑。

---

### Phase 2 — 下载按钮开关(功能,前后台联动)

| 项 | 内容 | 涉及 |
|----|------|------|
| 2-1 (A3) | Step5 增加「开启下载按钮」checkbox 开关 | AdminDashboard.js Step5 |
| 2-2 | 新增 Notion 字段 `download_enabled`(checkbox;旧 schema 不存在该字段时按「有下载链接即显示」兜底,保持现状不回归) | post.js 属性读写 + readProperty 兼容 |
| 2-3 | 前台 gallery 下载按钮/下载弹窗按开关判断显示(仅 gallery 生效,与用户描述一致;字段保留供未来其他主题接入) | GalleryPostDownloadButton / GalleryDownloadModal |

**验收**:后台开关保存→Notion 字段正确;前台 gallery 关闭开关后下载入口隐藏;开启恢复;旧文章(无字段)行为不变。

---

### Phase 3 — 未保存保护 + 草稿(核心状态管理,高风险)

| 项 | 内容 | 涉及 |
|----|------|------|
| 3-1 (A8) | dirty 检测:正文 blocks、Gallery 图片、封面、分类、标签、标题、slug、excerpt、下载字段任一变化 → 置 dirty | AdminDashboard.js(所有 setForm/setBlocks/setGalleryItems 入口统一挂 dirty 标记) |
| 3-2 (B2) | `beforeunload` + 路由/返回拦截:「继续离开 / 留在编辑器 / 保存到草稿」三选一弹窗 | AdminDashboard.js + 全局 |
| 3-3 (B3) | 「保存到草稿」:localStorage 持久化完整编辑快照(blocks + form + gallery + cover),可恢复 | 新 lib 或 AdminDashboard 内 |
| 3-4 | 草稿类型:保存时可选 status=Draft(Notion Draft)而不是 Published | post.js 已支持 status 传参,主要 UI 加选项 |

**注意**:dirty 标记要挂在统一入口(现有 `updateBlock`/`setForm` 包装),避免散落漏检;不得影响现有保存/发布流程的时序。

---

### Phase 4 — 发布失败恢复(依赖 Phase 3 的快照基础设施)

| 项 | 内容 | 涉及 |
|----|------|------|
| 4-1 (A6) | 发布队列失败任务提供「恢复到编辑器」:把该任务携带的最后一次快照重新填回编辑器 | AdminDashboard.js 发布队列区 |
| 4-2 (A6) | 「仅重试失败步骤」:按 phase(media/gallery/post/refresh)断点续跑,跳过已完成阶段 | AdminDashboard.js 发布任务状态机 |
| 4-3 (A6) | 最后一次编辑快照长期保留(indexedDB/localStorage,带时间戳与任务 id 关联) | 复用 3-3 快照机制扩展 |

**注意**:发布任务状态机现有 `job.status` / `job.phase`(media/gallery/post/refresh)已具备断点信息,新增重试逻辑必须复用现有状态,不推翻现有队列实现。

---

### Phase 5 — 块能力补齐(高风险,涉及块转换核心,严禁破坏加密块)

| 项 | 内容 | 涉及 |
|----|------|------|
| 5-1 (B1) | `toggle` 支持:Notion toggle → 编辑器 toggle 块(子块为普通内容,导入导出双向) | post.js 转换 + AdminDashboard 渲染/编辑控件 + editorBlockLock 字段 |
| 5-2 (B1) | `code` 支持:Notion code(含 language)→ 编辑器 code 块,导出还原 language 与内容 | 同上 |
| 5-3 (B4) | todo 行内 checkbox:点击行首圆圈切换该行 checked(替换/并存 `[x]` 前缀) | AdminDashboard todo 编辑控件 |
| 5-4 (B6) | 粘贴自动分块:粘贴多行文本到 text 块时检测 `1. `/`- `/`# `/`[ ] `/`[x] ` 前缀,提示/自动转为对应块 | AdminDashboard paste 处理 |
| 5-5 (B7) | `blocksToMarkdown` 补 ol(行首 `1. `)/ul(`- `)/todo(`[ ] `/`[x] `)序列化 | contentMediaFlush.js |

**⚠️ 铁律**:5-1/5-2 涉及 `post.js` 块转换核心(notionToEditorBlocks / structuredToBlocks / lockCalloutToEditorBlock / styledLinesToChildren),**GLM 必须先输出设计(块数据结构、转换分支、加密块交互)经 Hermes 确认后才可动手**;加密块(LOCK callout)逻辑一行都不许碰,只能新增分支。

---

### Phase 6 — 图床孤立文件治理(独立大工程,治理类)

| 项 | 内容 | 涉及 |
|----|------|------|
| 6-1 | 兰空 API 能力确认:文件列表/删除接口是否可用(需查兰空版本文档) | 调研 |
| 6-2 | 孤立文件扫描:比对兰空全部文件 vs Notion 正文/封面/Gallery 引用,产出孤立清单 + 容量统计 | 新 API + 服务端脚本 |
| 6-3 | 清理预览 UI:后台展示孤立文件数、总容量、按时间/大小排序,预览删除对象 | AdminDashboard 新面板 |
| 6-4 | 回收站 + 延迟清理:删除进回收站,7 天后真正删除(或手动清空) | 兰空侧 + 后台 |

**注意**:删除是不可逆操作,必须「预览 → 回收站 → 延迟清理」三步走;扫描期间不得阻塞正常上传。

---

## 派工与验收纪律(所有 Phase 通用)

1. **执行**:GLM5.3(opencode CLI),派工单写 `XXX_BRIEF.md` 到仓库根目录,自包含、精确到文件+函数。
2. **删改前先问**:派工单中明确「涉及删除/修改现有逻辑(尤其加密块、块转换、发布状态机、保存链路)必须先输出方案待 Hermes 确认,不得直接删改」。
3. **不破坏现有功能**:每个 Phase 验收必须跑回归——打开旧文章编辑保存、加密块往返、图库保存、发布队列,确认无回归。
4. **独立验收**:Hermes 亲自 bundle 转换函数跑往返测试 + 亲自跑 build;不轻信 GLM 自报。
5. **文档同步**:每个 Phase 完成后更新 AGENTS.md 对应章节。
6. **提交纪律**:每 Phase 独立 commit;只提交该 Phase 相关文件。

## 建议执行顺序

Phase 1(快)→ Phase 2(下载开关)→ Phase 3(未保存保护+草稿)→ Phase 4(发布失败恢复)→ Phase 5(块能力)→ Phase 6(图床治理)。

Phase 3/4 有依赖(快照基础设施),Phase 5 风险最高放中间给足测试时间,Phase 6 独立可随时插入。
