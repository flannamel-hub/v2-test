-- P14 preflight:blog_site_settings 增列 content_protect(只读)
-- Revision: 20260825.blog-site-settings-content-protect.1
-- 执行本库(bloggallery)supabase/migrations/018_blog_site_settings_content_protect.sql 前运行。
-- 期望 ready=true。本脚本不创建或修改任何数据。

with relations as (
  select to_regclass('public.blog_site_settings') is not null as settings_exists
),
columns as (
  select
    count(*) filter (where column_name = 'site_id') = 1 as site_id_present,
    count(*) filter (where column_name = 'content_protect') = 0 as content_protect_absent
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'blog_site_settings'
),
report as (
  select relations.*, columns.* from relations cross join columns
)
select
  '20260825.blog-site-settings-content-protect.1' as revision,
  (settings_exists and site_id_present and content_protect_absent) as ready,
  to_jsonb(report) as checks,
  case
    when not settings_exists then
      'blog_site_settings is missing; run 003_blog_site_settings.sql first.'
    when not site_id_present then
      'site_id column missing; inspect blog_site_settings before running migration.'
    when not content_protect_absent then
      'content_protect column already exists; inspect before running migration.'
    else 'Ready. Run 018_blog_site_settings_content_protect.sql, then verify-blog-site-settings-content-protect.sql.'
  end as next_step
from report;
