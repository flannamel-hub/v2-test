-- revision: 20260824.blog-usage-p2.1
-- 只读预检;ready=true 才允许执行 migrations/014_blog_usage_pv_daily.sql。

with roles as (
  select
    exists (select 1 from pg_roles where rolname = 'anon') as anon_exists,
    exists (select 1 from pg_roles where rolname = 'authenticated') as authenticated_exists,
    exists (select 1 from pg_roles where rolname = 'service_role') as service_role_exists
),
targets as (
  select
    to_regclass('public.blog_usage_pv_daily') is not null as usage_table_exists,
    to_regprocedure('public.record_blog_usage_pv(uuid, date, integer)') is not null
      as record_rpc_exists
),
report as (
  select
    roles.*,
    targets.*,
    not (usage_table_exists or record_rpc_exists) as targets_absent
  from roles
  cross join targets
)
select
  '20260824.blog-usage-p2.1' as revision,
  (
    anon_exists
    and authenticated_exists
    and service_role_exists
    and targets_absent
  ) as ready,
  to_jsonb(report) - 'targets_absent' as checks,
  case
    when not targets_absent then
      'P2 PV usage objects already exist or are partially installed; inspect before running migration.'
    when not (anon_exists and authenticated_exists and service_role_exists) then
      'Required Supabase roles are missing.'
    else
      'Ready. Run 014_blog_usage_pv_daily.sql, then verify-blog-usage-pv-daily.sql.'
  end as next_step
from report;
