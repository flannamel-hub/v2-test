-- revision: 20260824.blog-usage-p2.1
-- 只读验收;ready=true 表示表、约束、RLS 与权限边界均已就位。

with relations as (
  select
    to_regclass('public.blog_usage_pv_daily') is not null as usage_table_exists
),
columns as (
  select
    count(*) filter (
      where column_name in ('site_id', 'day', 'pv', 'updated_at')
    ) = 4 as columns_ready,
    count(*) filter (
      where column_name = 'site_id' and data_type = 'uuid' and is_nullable = 'NO'
    ) = 1 as site_id_ok,
    count(*) filter (
      where column_name = 'day' and data_type = 'date' and is_nullable = 'NO'
    ) = 1 as day_ok,
    count(*) filter (
      where column_name = 'pv' and data_type = 'bigint' and is_nullable = 'NO'
    ) = 1 as pv_ok
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'blog_usage_pv_daily'
),
constraints_ready as (
  select
    count(*) filter (
      where constraint_row.conname = 'blog_usage_pv_daily_pkey'
    ) = 1 as pk_ready,
    count(*) filter (
      where constraint_row.conname = 'blog_usage_pv_daily_pv_check'
    ) = 1 as pv_check_ready
  from pg_constraint constraint_row
  join pg_class rel on rel.oid = constraint_row.conrelid
  join pg_namespace namespace on namespace.oid = rel.relnamespace
  where namespace.nspname = 'public'
    and rel.relname = 'blog_usage_pv_daily'
    and constraint_row.contype in ('p', 'c')
),
rls as (
  select
    coalesce(bool_and(relrowsecurity), false) as rls_enabled
  from pg_class rel
  join pg_namespace namespace on namespace.oid = rel.relnamespace
  where namespace.nspname = 'public'
    and rel.relname = 'blog_usage_pv_daily'
),
privileges as (
  select
    not has_table_privilege('anon', 'public.blog_usage_pv_daily', 'SELECT,INSERT,UPDATE,DELETE')
      as anon_no_table_privs,
    not has_table_privilege('authenticated', 'public.blog_usage_pv_daily', 'SELECT,INSERT,UPDATE,DELETE')
      as authenticated_no_table_privs,
    has_table_privilege('service_role', 'public.blog_usage_pv_daily', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      as service_role_full_privs
),
rpc as (
  select
    to_regprocedure('public.record_blog_usage_pv(uuid, date, integer)') is not null
      as rpc_exists,
    coalesce(
      (
        select proc.prosecdef
        from pg_proc proc
        where proc.oid = to_regprocedure('public.record_blog_usage_pv(uuid, date, integer)')
      ),
      false
    ) as rpc_security_definer,
    has_function_privilege('service_role', 'public.record_blog_usage_pv(uuid, date, integer)', 'EXECUTE')
      as service_role_execute,
    not has_function_privilege('anon', 'public.record_blog_usage_pv(uuid, date, integer)', 'EXECUTE')
      as anon_no_execute,
    not has_function_privilege('authenticated', 'public.record_blog_usage_pv(uuid, date, integer)', 'EXECUTE')
      as authenticated_no_execute
)
select
  '20260824.blog-usage-p2.1' as revision,
  (
    usage_table_exists
    and columns_ready and site_id_ok and day_ok and pv_ok
    and pk_ready and pv_check_ready
    and rls_enabled
    and anon_no_table_privs and authenticated_no_table_privs and service_role_full_privs
    and rpc_exists and rpc_security_definer
    and service_role_execute and anon_no_execute and authenticated_no_execute
  ) as ready,
  jsonb_build_object(
    'relations', to_jsonb(relations),
    'columns', to_jsonb(columns),
    'constraints', to_jsonb(constraints_ready),
    'rls', to_jsonb(rls),
    'privileges', to_jsonb(privileges),
    'rpc', to_jsonb(rpc)
  ) as checks,
  case
    when not usage_table_exists then 'blog_usage_pv_daily is missing; run the migration first.'
    when not (columns_ready and site_id_ok and day_ok and pv_ok) then 'Column shape mismatch; inspect blog_usage_pv_daily.'
    when not (pk_ready and pv_check_ready) then 'Primary key or pv check constraint missing.'
    when not rls_enabled then 'RLS is not enabled on blog_usage_pv_daily.'
    when not (anon_no_table_privs and authenticated_no_table_privs) then 'anon/authenticated still hold table privileges; revoke them.'
    when not service_role_full_privs then 'service_role lacks full table privileges.'
    when not (rpc_exists and rpc_security_definer) then 'record_blog_usage_pv missing or not security definer.'
    when not (service_role_execute and anon_no_execute and authenticated_no_execute) then 'record_blog_usage_pv execute privileges mismatch.'
    else 'Ready. PV counter can write via service_role; main site can aggregate by site_id.'
  end as next_step
from relations, columns, constraints_ready, rls, privileges, rpc;
