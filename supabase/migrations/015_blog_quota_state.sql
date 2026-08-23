-- ============================================================
-- BLOG 分层 P3:站点级配额状态(只读标志,供 BLOG 中间件读取)
-- Revision: 20260825.blog-quota-state.1
--
-- 共用库(bloggallery):site_id 即主站 merchant_services.id。
-- 主站判定 cron(/api/cron/enforce-blog-quota)在阈值变化时 upsert:
--   - read_only:boolean(>=100% 只读;<70% 或月度重置解除)
--   - status:normal | warning | read_only | paused
-- BLOG 侧 middleware 经 REST(service role)只读该表;
-- 失败一律视为未只读(防误伤),不在 BLOG 侧缓存任何密钥。
--
-- blog_site_settings 仅承载主题字段(theme_code/theme_config_page_id),
-- 无通用可写 jsonb 配置列,故按派工单新建独立表。
--
-- 执行顺序:
--   supabase/scripts/preflight-blog-quota-state.sql(只读,期望 ready=true)
--   → 本迁移 → supabase/scripts/verify-blog-quota-state.sql(只读,期望 ready=true)
-- ============================================================

create table if not exists public.blog_quota_state (
  site_id uuid primary key,
  read_only boolean not null default false,
  status text not null default 'normal' check (status in ('normal','warning','read_only','paused')),
  updated_at timestamptz not null default now()
);

comment on table public.blog_quota_state is
  'BLOG 分层 P3:站点级配额状态(site_id = 主站 merchant_services.id);主站判定 cron 写入,BLOG 侧只读;read_only=true 时 BLOG 中间件拦截商户侧写 API';

alter table public.blog_quota_state enable row level security;

-- 仅服务端(service_role / 主站 cron)可写;anon/authenticated 零权限:
revoke all on public.blog_quota_state from public, anon, authenticated;
grant all on public.blog_quota_state to service_role;
