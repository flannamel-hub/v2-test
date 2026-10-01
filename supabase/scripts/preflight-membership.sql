-- 站点会员 B1 preflight:blog_site_settings 增列 membership(只读)
-- Revision: 20261002.site-membership-b1.1
-- 执行本库 supabase/migrations/022_membership.sql 前运行。
-- 期望 ready=true。本脚本不创建或修改任何数据。
-- 断言:blog_site_settings 表存在、site_id 列存在、membership 列不存在(迁移前状态,防重复执行)。

with relations as (
  select to_regclass('public.blog_site_settings') is not null as settings_exists
),
columns as (
  select
    count(*) filter (where column_name = 'site_id') = 1 as site_id_present,
    count(*) filter (where column_name = 'membership') = 0 as membership_absent
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'blog_site_settings'
),
report as (
  select relations.*, columns.* from relations cross join columns
)
select
  '20261002.site-membership-b1.1' as revision,
  (settings_exists and site_id_present and membership_absent) as ready,
  to_jsonb(report) as checks,
  case
    when not settings_exists then
      'blog_site_settings is missing; run 003_blog_site_settings.sql first.'
    when not site_id_present then
      'site_id column missing; inspect blog_site_settings before running migration.'
    when not membership_absent then
      'membership column already exists; inspect before running migration.'
    else 'Ready. Run 022_membership.sql, then verify-membership.sql.'
  end as next_step
from report;
