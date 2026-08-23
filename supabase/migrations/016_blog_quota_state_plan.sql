-- ============================================================
-- BLOG 分层 P4:blog_quota_state 扩展 plan + 用量百分比列
-- Revision: 20260826.blog-quota-state-plan.1
--
-- 共用库(bloggallery):site_id 即主站 merchant_services.id。
-- 主站写入点(P3 既有,不变):
--   - /api/cron/enforce-blog-quota 每日粘合(plan + pv/bw/gallery 百分比);
--   - 管理员 plan 变更 / 订阅到期降级联动(仅更新 plan)。
-- BLOG 侧服务端短缓存(30s)只读,读取失败降级 free/normal/0(不阻塞页面)。
--
-- 本迁移只加列;015 的 RLS / revoke / grant 对表继续生效,
-- alter 不改变既有权限(verify 断言权限与 015 verify 口径一致)。
--
-- 执行顺序:
--   supabase/scripts/preflight-blog-quota-state-plan.sql(只读,期望 ready=true)
--   → 本迁移 → supabase/scripts/verify-blog-quota-state-plan.sql(只读,期望 ready=true)
-- ============================================================

alter table public.blog_quota_state
  add column if not exists plan text not null default 'free' check (plan in ('free','pro')),
  add column if not exists pv_pct numeric(6,2) not null default 0,
  add column if not exists bw_pct numeric(6,2) not null default 0,
  add column if not exists gallery_pct numeric(6,2) not null default 0;

comment on column public.blog_quota_state.plan is
  'BLOG 分层 P4:站点当前会员计划(free|pro);主站 plan 联动与每日 enforce cron 写入,BLOG 侧只读';
comment on column public.blog_quota_state.pv_pct is
  '本月访问用量百分比(numeric 6,2;主站 enforce cron 每日写入;仅展示用)';
comment on column public.blog_quota_state.bw_pct is
  '本月带宽估算用量百分比(numeric 6,2;主站 enforce cron 每日写入;仅展示用)';
comment on column public.blog_quota_state.gallery_pct is
  '图库容量用量百分比(numeric 6,2;主站 enforce cron 每日写入;仅展示用)';
