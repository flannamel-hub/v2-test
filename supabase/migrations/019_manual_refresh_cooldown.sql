-- 手动「刷新BLOG」（壳层手动刷新）30 分钟冷却，按商户 site_id 持久化
-- 读写方：src/pages/api/admin/revalidate.js（scope=shell 且 manualShell 路径）
-- 降级：未执行本迁移时，读取返回空、写入失败仅告警，退回进程内变量兜底
alter table public.blog_site_settings
  add column if not exists last_manual_refresh_at timestamptz;

comment on column public.blog_site_settings.last_manual_refresh_at is
  '上次手动刷新BLOG（壳层手动刷新）时间（30 分钟冷却，防爆破）';
