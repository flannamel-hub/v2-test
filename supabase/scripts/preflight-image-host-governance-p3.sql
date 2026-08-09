-- revision: 20260809-image-host-p3-v1
-- 只读预检；ready=true 才允许执行 012_image_host_governance.sql。

with roles as (
  select
    exists (select 1 from pg_roles where rolname = 'anon') as anon_exists,
    exists (select 1 from pg_roles where rolname = 'authenticated') as authenticated_exists,
    exists (select 1 from pg_roles where rolname = 'service_role') as service_role_exists
),
dependencies as (
  select
    to_regclass('public.blog_revalidate_queue') is not null as revalidate_queue_exists,
    to_regprocedure('gen_random_uuid()') is not null as gen_random_uuid_exists
),
targets as (
  select
    to_regclass('public.blog_image_host_config') is not null as config_table_exists,
    to_regclass('public.blog_image_host_events') is not null as events_table_exists,
    to_regprocedure('public.normalize_blog_image_host_origin(text)') is not null
      as normalize_origin_exists,
    to_regprocedure('public.normalize_blog_image_host_origins(text[])') is not null
      as normalize_origins_exists,
    to_regprocedure('public.validate_blog_image_host_summary(jsonb)') is not null
      as validate_summary_exists,
    to_regprocedure(
      'public.activate_blog_image_host_config(bigint,text,text,text[],uuid,text,jsonb)'
    ) is not null as activate_rpc_exists,
    to_regprocedure(
      'public.rollback_blog_image_host_config(bigint,uuid,text,jsonb)'
    ) is not null as rollback_rpc_exists
),
report as (
  select
    roles.*,
    dependencies.*,
    targets.*,
    not (
      config_table_exists
      or events_table_exists
      or normalize_origin_exists
      or normalize_origins_exists
      or validate_summary_exists
      or activate_rpc_exists
      or rollback_rpc_exists
    ) as targets_absent
  from roles
  cross join dependencies
  cross join targets
)
select
  '20260809-image-host-p3-v1' as revision,
  (
    anon_exists
    and authenticated_exists
    and service_role_exists
    and revalidate_queue_exists
    and gen_random_uuid_exists
    and targets_absent
  ) as ready,
  to_jsonb(report) - 'targets_absent' as checks,
  case
    when not targets_absent then
      'P3 target objects already exist or are partially installed; inspect before running migration.'
    when not (anon_exists and authenticated_exists and service_role_exists) then
      'Required Supabase roles are missing.'
    when not revalidate_queue_exists then
      'blog_revalidate_queue is missing; install migration 010 first.'
    when not gen_random_uuid_exists then
      'gen_random_uuid() is unavailable.'
    else
      'Ready. Run 012_image_host_governance.sql, then verify-image-host-governance-p3.sql.'
  end as next_step
from report;
