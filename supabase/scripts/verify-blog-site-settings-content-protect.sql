-- P14 verify:blog_site_settings 增列 content_protect(只读)
-- Revision: 20260825.blog-site-settings-content-protect.1
-- 执行本库(bloggallery)supabase/migrations/018_blog_site_settings_content_protect.sql 后运行。
-- 期望 ready=true。断言:content_protect 列存在且类型/非空/默认值正确;不改动既有表口径。

with relations as (
  select to_regclass('public.blog_site_settings') is not null as settings_exists
),
content_protect_column as (
  select
    count(*) filter (
      where column_name = 'content_protect'
        and data_type = 'boolean'
        and is_nullable = 'NO'
    ) = 1 as content_protect_ok,
    count(*) filter (
      where column_name = 'content_protect'
        and column_default = 'false'
    ) = 1 as default_false_ok
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'blog_site_settings'
)
select
  '20260825.blog-site-settings-content-protect.1' as revision,
  (
    settings_exists
    and content_protect_ok and default_false_ok
  ) as ready,
  jsonb_build_object(
    'relations', to_jsonb(relations),
    'content_protect_column', to_jsonb(content_protect_column)
  ) as checks,
  case
    when not settings_exists then 'blog_site_settings is missing; run 003 first.'
    when not (content_protect_ok and default_false_ok) then
      'content_protect column shape mismatch; inspect blog_site_settings.'
    else 'Ready. BLOG server can read/write content_protect via blog_site_settings upsert.'
  end as next_step
from relations, content_protect_column;
