-- BLOG 分层 P3 preflight:blog_quota_state(只读)
-- Revision: 20260825.blog-quota-state.1
-- 执行本库(bloggallery)supabase/migrations/015_blog_quota_state.sql 前运行。
-- 期望 ready=true。本脚本不创建或修改任何数据。

with roles as (
  select
    exists (select 1 from pg_roles where rolname = 'anon') as anon_exists,
    exists (select 1 from pg_roles where rolname = 'authenticated') as authenticated_exists,
    exists (select 1 from pg_roles where rolname = 'service_role') as service_role_exists
),
targets as (
  select
    to_regclass('public.blog_quota_state') is not null as quota_state_exists
),
report as (
  select roles.*, targets.* from roles cross join targets
)
select
  '20260825.blog-quota-state.1' as revision,
  (
    anon_exists and authenticated_exists and service_role_exists
    and not quota_state_exists
  ) as ready,
  to_jsonb(report) as checks,
  case
    when quota_state_exists then
      'blog_quota_state already exists; inspect before running migration.'
    when not (anon_exists and authenticated_exists and service_role_exists) then
      'Required Supabase roles are missing.'
    else 'Ready. Run 015_blog_quota_state.sql, then verify-blog-quota-state.sql.'
  end as next_step
from report;
