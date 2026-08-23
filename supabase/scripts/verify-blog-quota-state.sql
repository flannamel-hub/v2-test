-- BLOG 分层 P3 verify:blog_quota_state(只读)
-- Revision: 20260825.blog-quota-state.1
-- 执行本库(bloggallery)supabase/migrations/015_blog_quota_state.sql 后运行。
-- 期望 ready=true。本脚本不创建或修改任何数据。

with relations as (
  select to_regclass('public.blog_quota_state') is not null as quota_state_exists
),
columns as (
  select
    count(*) filter (
      where column_name in ('site_id', 'read_only', 'status', 'updated_at')
    ) = 4 as columns_ready,
    count(*) filter (
      where column_name = 'site_id' and data_type = 'uuid' and is_nullable = 'NO'
    ) = 1 as site_id_ok,
    count(*) filter (
      where column_name = 'read_only' and data_type = 'boolean' and is_nullable = 'NO'
    ) = 1 as read_only_ok,
    count(*) filter (
      where column_name = 'status' and data_type = 'text' and is_nullable = 'NO'
    ) = 1 as status_ok
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'blog_quota_state'
),
constraints_ready as (
  select
    count(*) filter (
      where constraint_row.contype = 'p'
        and constraint_row.conname = 'blog_quota_state_pkey'
    ) = 1 as pk_ready,
    count(*) filter (
      where constraint_row.contype = 'c'
        and constraint_row.conname = 'blog_quota_state_status_check'
    ) = 1 as status_check_ready
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
  '20260825.blog-quota-state.1' as revision,
  (
    quota_state_exists
    and columns_ready and site_id_ok and read_only_ok and status_ok
    and pk_ready and status_check_ready
    and rls_enabled
    and anon_no_privs and authenticated_no_privs and service_role_full_privs
    and no_policies
  ) as ready,
  jsonb_build_object(
    'relations', to_jsonb(relations),
    'columns', to_jsonb(columns),
    'constraints', to_jsonb(constraints_ready),
    'rls', to_jsonb(rls),
    'privileges', to_jsonb(privileges),
    'policies', to_jsonb(policies)
  ) as checks,
  case
    when not quota_state_exists then 'blog_quota_state is missing; run the migration first.'
    when not (columns_ready and site_id_ok and read_only_ok and status_ok) then
      'Column shape mismatch; inspect blog_quota_state.'
    when not (pk_ready and status_check_ready) then
      'Primary key or status check constraint missing.'
    when not rls_enabled then 'RLS is not enabled on blog_quota_state.'
    when not (anon_no_privs and authenticated_no_privs) then
      'Browser-role privileges are wider than designed.'
    when not service_role_full_privs then 'service_role lacks full table privileges.'
    when not no_policies then 'Unexpected RLS policies exist on blog_quota_state.'
    else 'Ready. Main-site cron can upsert; BLOG middleware can read via service role REST.'
  end as next_step
from relations, columns, constraints_ready, rls, privileges, policies;
