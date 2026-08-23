-- BLOG 分层 P4 preflight:blog_quota_state 扩展列(只读)
-- Revision: 20260826.blog-quota-state-plan.1
-- 执行本库(bloggallery)supabase/migrations/016_blog_quota_state_plan.sql 前运行。
-- 期望 ready=true。本脚本不创建或修改任何数据。

with relations as (
  select to_regclass('public.blog_quota_state') is not null as quota_state_exists
),
columns as (
  select
    count(*) filter (where column_name = 'plan') = 0 as plan_absent,
    count(*) filter (where column_name = 'pv_pct') = 0 as pv_pct_absent,
    count(*) filter (where column_name = 'bw_pct') = 0 as bw_pct_absent,
    count(*) filter (where column_name = 'gallery_pct') = 0 as gallery_pct_absent
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'blog_quota_state'
),
report as (
  select relations.*, columns.* from relations cross join columns
)
select
  '20260826.blog-quota-state-plan.1' as revision,
  (
    quota_state_exists
    and plan_absent and pv_pct_absent and bw_pct_absent and gallery_pct_absent
  ) as ready,
  to_jsonb(report) as checks,
  case
    when not quota_state_exists then
      'blog_quota_state is missing; run 015_blog_quota_state.sql first.'
    when not (plan_absent and pv_pct_absent and bw_pct_absent and gallery_pct_absent) then
      'Some P4 columns already exist; inspect before running migration.'
    else 'Ready. Run 016_blog_quota_state_plan.sql, then verify-blog-quota-state-plan.sql.'
  end as next_step
from report;
