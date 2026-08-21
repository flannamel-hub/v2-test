# Phase6 图床孤立文件治理 — 方案(调研完成,待用户确认)

## 6-1 调研结论(已完成,实测)

兰空 Lsky Pro 2.x(堡垒池 img.vlogs.cc,version=2):

| 能力 | 端点 | 实测结果 |
|---|---|---|
| 文件列表 | `GET /api/v1/images?page=N&per_page=M` | ✅ 200,分页结构(current_page/data/total),字段:key/name/origin_name/size(KB)/mimetype/extension/md5/sha1/width/height/date/pathname/links |
| 删除文件 | `DELETE /api/v1/images/{key}` | ✅ 200「删除成功」;**注意:不存在的 key 也返回成功(幂等),误删无提示——扫描引用必须精确** |
| 容量统计 | 列表 size 聚合 | ✅ |
| token 权限 | 读+删 | ✅ 全开 |

⚠️ 兰空无回收站概念,删除即真删、不可恢复——应用层必须做「预览→回收站(延迟真删)→留痕」三步走。

## 6-2 孤立文件扫描(服务端)

**引用集构建**(扫 Notion 全库 + Supabase 图库):
1. Notion:拉取全库文章/页面/Widget 的 `cover` 字段 + 每篇正文 blocks 中 image 块 URL(含加密块内图片,遍历 children);
2. Supabase 图库(BLOG 侧):所有 site 的 gallery 图片 URL(若有 BLOG_SITE_ID 只扫当前配套,无则扫全部或按配置);
3. 归一化:URL → pathname(去掉协议/域名/查询参数),与兰空文件的 pathname 对比。

**扫描执行**:新 API `GET /api/admin/lsky-scan`(服务端):分页拉全量兰空文件(per_page=100,循环)→ 过滤出「未被任何引用」的文件 → 返回 { total_files, total_size, orphans: [{key, name, size, date, url, pathname}] }。大库分页多时用游标/分批,单次请求超时风险 → 前端轮询或限制单次返回条数(如最多 3000 条,超出提示分批)。

**性能**:Notion 全库正文 blocks 拉取量大(每篇文章 blocks 请求),用现有缓存/并发控制;扫描是低频运维操作,允许较慢(前端显示进度)。

## 6-3 清理预览 UI(后台新面板)

- 顶栏加「🗂 图床管理」入口(或并入草稿箱旁) → view='lsky' 面板:
  - 顶部统计:总文件数 / 总容量 / 孤立文件数 / 孤立容量;
  - 孤立列表:缩略图(links.url 或 pathname 拼域名)+ 文件名 + 大小 + 日期,按时间/大小排序,勾选;
  - 批量操作:「移入回收站」(勾选项)→ 二次确认弹窗(显示数量+容量,提示 7 天后自动真删、期间可恢复);
- UI 文案铁律:禁技术栈关键字(兰空/Notion 等→「存储服务/云端」)、少文字。

## 6-4 回收站 + 延迟清理(应用层,兰空侧无回收站)

- 「移入回收站」= 把选中项写入**回收站清单**(localStorage 键 `lsky_trash`,条目 {key, name, size, url, trashedAt})——**不立即调 DELETE,文件安全可恢复**;
- 回收站视图:显示待删清单 + 剩余天数(7 天倒计时)+ 「恢复」(从清单移除,文件未删,即恢复引用保留)+ 「立即清理」;
- **惰性真删**:进入图床管理/回收站视图时,检查清单中 `trashedAt` 超过 7 天的条目 → 逐条调 `DELETE /api/v1/images/{key}` → 成功后从清单移除;失败保留并提示;
- 删除留痕:清理过的条目移入「已清理」历史(仅记录,可清空)。

## 边界与铁律

- 扫描期间不得阻塞正常上传(只读操作);
- 删除必须经回收站延迟(7 天)+ 强确认,禁止一键真删;
- 引用集遗漏保护:凡无法确认引用的 URL(如正文 markdown 图片语法 `![](...)`、加密块 children 图片),**宁可不删**(保守策略,孤儿率略低可接受);
- 不动上传链路、不动兰空配置、不新增依赖。

## 执行方式

方案确认后写派工单(服务端扫描 API + 后台面板 + 回收站),派 GLM5.3 执行;独立验收 + build + 保守性走查。
