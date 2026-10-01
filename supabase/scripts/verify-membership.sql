-- 站点会员 B1 verify:blog_site_settings.membership 列(只读)
-- Revision: 20261002.site-membership-b1.1
-- 执行本库 supabase/migrations/022_membership.sql 后运行。
-- 期望 ready=true;连跑两次结果一致(幂等)。本脚本不修改任何数据。
-- 断言:列存在且 jsonb / 可空(is_nullable='YES')/ 无默认(column_default is null);
--   comment 含关键语义(平台写 + fail-closed);
--   列上无列级授权(pg_attribute.attacl is null,审阅 M2)。

with relations as (
  select to_regclass('public.blog_site_settings') is not null as settings_exists
),
membership_column as (
  select
    count(*) filter (
      where column_name = 'membership'
        and data_type = 'jsonb'
        and is_nullable = 'YES'
        and column_default is null
    ) = 1 as membership_column_ok
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'blog_site_settings'
),
column_acl as (
  select
    count(*) filter (where a.attname = 'membership' and a.attacl is not null) = 0
      as membership_attacl_clean
  from pg_attribute a
  where a.attrelid = 'public.blog_site_settings'::regclass
    and a.attname = 'membership'
),
column_comment as (
  select
    coalesce(
      (
        select col_description('public.blog_site_settings'::regclass, a.attnum)
        from pg_attribute a
        where a.attrelid = 'public.blog_site_settings'::regclass
          and a.attname = 'membership'
      ),
      ''
    ) as comment_text
)
select
  '20261002.site-membership-b1.1' as revision,
  (
    settings_exists
    and membership_column_ok
    and membership_attacl_clean
    and column_comment.comment_text like '%平台写%'
    and column_comment.comment_text like '%fail-closed%'
  ) as ready,
  jsonb_build_object(
    'relations', to_jsonb(relations),
    'membership_column', to_jsonb(membership_column),
    'column_acl', to_jsonb(column_acl),
    'column_comment', to_jsonb(column_comment)
  ) as checks,
  case
    when not settings_exists then
      'blog_site_settings is missing; run 003_blog_site_settings.sql first.'
    when not membership_column_ok then
      'membership column missing or shape mismatch (expect jsonb, nullable, no default); run 022_membership.sql first.'
    when not membership_attacl_clean then
      'membership column has column-level ACL grants (pg_attribute.attacl not null); inspect before proceeding.'
    when column_comment.comment_text not like '%平台写%'
      or column_comment.comment_text not like '%fail-closed%' then
      'membership column comment missing key semantics; re-run comment in 022_membership.sql.'
    else 'Ready. membership column live (platform writes, BLOG reads, fail-closed).'
  end as next_step
from relations, membership_column, column_acl, column_comment;
