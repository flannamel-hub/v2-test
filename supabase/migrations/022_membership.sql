-- 站点会员 B1:blog_site_settings 增列 membership(站点会员配置 jsonb)
-- Revision: 20261002.site-membership-b1.1
-- 依据:BLOG_MEMBERSHIP_B1_BRIEF.md §3(名称由系统侧方案 §16 定稿)
-- membership jsonb(可空,无默认):
-- - 平台写 / BLOG 只读;承载 {enabled, plans[], copy} 配置(派工单附录 D 形态);
-- - fail-closed:缺失 / 读取失败 / 无行 / enabled!==true / 值非法 → 功能关闭
--   (读取件 src/lib/blog/membershipGate.ts);
-- - 不加默认值、不回填、不动 RLS/权限/其它列。
-- 执行顺序:
--   supabase/scripts/preflight-membership.sql(只读,期望 ready=true)
--   → 本迁移 → supabase/scripts/verify-membership.sql(只读,期望 ready=true)

alter table public.blog_site_settings
  add column if not exists membership jsonb;

comment on column public.blog_site_settings.membership is
  '站点会员配置（平台写/BLOG 只读，fail-closed：缺失或非法=功能关闭；形态 {enabled,plans,copy}）';
