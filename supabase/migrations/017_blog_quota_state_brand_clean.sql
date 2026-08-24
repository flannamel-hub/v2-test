-- ============================================================
-- BLOG 分层 P8:blog_quota_state 增列 brand_clean(去除平台角标)
-- Revision: 20260827.blog-quota-state-brand-clean.1
--
-- 共用库(bloggallery):site_id 即主站 merchant_services.id。
-- - brand_clean = true 且 plan = 'pro' 时,读者端隐藏「在PRO+上创作」
--   按钮与 footer「Powered by PRO+」角标,footer 改为「Powered by 站名」。
-- - 写入方:BLOG 侧商户 API(专业版可开/关;免费版一律拒绝);
--   主站 plan 粘合在 plan 回落 free 时强制 brand_clean=false(免费版强制显示角标)。
-- - BLOG 侧渲染读取双条件(brand_clean && plan='pro');到期/降级后自动恢复角标。
--
-- 本迁移只加列;015 的 RLS / revoke / grant 对表继续生效,
-- alter 不改变既有权限(verify 断言权限与 015/016 verify 口径一致)。
--
-- 执行顺序:
--   supabase/scripts/preflight-blog-quota-state-brand-clean.sql(只读,期望 ready=true)
--   → 本迁移 → supabase/scripts/verify-blog-quota-state-brand-clean.sql(只读,期望 ready=true)
-- ============================================================

alter table public.blog_quota_state
  add column if not exists brand_clean boolean not null default false;

comment on column public.blog_quota_state.brand_clean is
  'BLOG 分层 P8:去除平台角标(仅专业版可开启);BLOG 侧商户 API 写入,主站 plan 回落 free 时强制重置 false;渲染需同时满足 brand_clean 且 plan=pro';
