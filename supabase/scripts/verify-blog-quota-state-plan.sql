-- BLOG 分层 P4 verify:blog_quota_state 扩展列(只读)
-- Revision: 20260826.blog-quota-state-plan.1
-- 执行本库(bloggallery)supabase/migrations/016_blog_quota_state_plan.sql 后运行。
-- 期望 ready=true。断言:四列存在且类型正确 + 015 权限/RLS 口径不变。

with relations as (
  select to_regclass('public.blog_quota_state') is not null as quota_state_exists
),
p4_columns as (
  select
    count(*) filter (
      where column_name in ('plan', 'pv_pct', 'bw_pct', 'gallery_pct')
    ) = 4 as p4_columns_ready,
    count(*) filter (
      where column_name = 'plan'
        and data_type = 'text' and is_nullable = 'NO'
        and column_default like '''free''%'
    ) = 1 as plan_ok,
    count(*) filter (
      where column_name in ('pv_pct', 'bw_pct', 'gallery_pct')
        and data_type = 'numeric'
        and is_nullable = 'NO'
        and numeric_precision = 6
        and numeric_scale = 2
    ) = 3 as pct_columns_ok
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'blog_quota_state'
),
constraints_ready as (
  select
    count(*) filter (
      where constraint_row.contype = 'c'
        and constraint_row.conname = 'blog_quota_state_plan_check'
    ) = 1 as plan_check_ready
  from pg_constraint constraint_row
  join pg_class rel on rel.oid = constraint_row.conrelid
  join pg_namespace namespace on namespace.oid = rel.relnamespace
  where namespace.nspname = 'public'
    and rel.relname = 'blog_quota_state'
),
rls as (
  select coalesce(bool_and(relrowsecurity), false) as rls_enabled
  from pg_class rel
  join pg_namespace namespace on namespace.oid = rel.relnamespace
  where namespace.nspname = 'public'
    and rel.relname = 'blog_quota_state'
),
privileges as (
  select
    not has_table_privilege('anon', 'public.blog_quota_state', 'SELECT,INSERT,UPDATE,DELETE')
      as anon_no_privs,
    not has_table_privilege('authenticated', 'public.blog_quota_state', 'SELECT,INSERT,UPDATE,DELETE')
      as authenticated_no_privs,
    has_table_privilege('service_role', 'public.blog_quota_state', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      as service_role_full_privs
),
policies as (
  select count(*) = 0 as no_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'blog_quota_state'
)
select
  '20260826.blog-quota-state-plan.1' as revision,
  (
    quota_state_exists
    and p4_columns_ready and plan_ok and pct_columns_ok
    and plan_check_ready
    and rls_enabled
    and anon_no_privs and authenticated_no_privs and service_role_full_privs
    and no_policies
  ) as ready,
  jsonb_build_object(
    'relations', to_jsonb(relations),
    'p4_columns', to_jsonb(p4_columns),
    'constraints', to_jsonb(constraints_ready),
    'rls', to_jsonb(rls),
    'privileges', to_jsonb(privileges),
    'policies', to_jsonb(policies)
  ) as checks,
  case
    when not quota_state_exists then 'blog_quota_state is missing; run 015 first.'
    when not (p4_columns_ready and plan_ok and pct_columns_ok) then
      'P4 column shape mismatch; inspect blog_quota_state.'
    when not plan_check_ready then 'plan check constraint missing.'
    when not rls_enabled then 'RLS is not enabled on blog_quota_state.'
    when not (anon_no_privs and authenticated_no_privs) then
      'Browser-role privileges are wider than designed.'
    when not service_role_full_privs then 'service_role lacks full table privileges.'
    when not no_policies then 'Unexpected RLS policies exist on blog_quota_state.'
    else 'Ready. Main site can write plan/pcts; BLOG server can read with 30s cache.'
  end as next_step
from relations, p4_columns, constraints_ready, rls, privileges, policies;
