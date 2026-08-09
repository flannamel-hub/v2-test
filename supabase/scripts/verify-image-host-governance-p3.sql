-- revision: 20260809-image-host-p3-v1
-- 只读验收；ready=true 表示 P3 数据库底座、初始值与权限边界均已就位。

with relations as (
  select
    to_regclass('public.blog_image_host_config') is not null as config_table_exists,
    to_regclass('public.blog_image_host_events') is not null as events_table_exists
),
columns as (
  select
    count(*) filter (
      where table_name = 'blog_image_host_config'
        and column_name in (
          'id', 'upload_api_origin', 'public_asset_origin', 'legacy_asset_origins',
          'version', 'updated_by', 'reason', 'updated_at'
        )
    ) = 8 as config_columns_ready,
    count(*) filter (
      where table_name = 'blog_image_host_events'
        and column_name in (
          'id', 'event_type', 'previous_version', 'new_version', 'previous_config',
          'new_config', 'actor_id', 'reason', 'validation_summary', 'created_at'
        )
    ) = 10 as event_columns_ready
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('blog_image_host_config', 'blog_image_host_events')
),
constraints_ready as (
  select
    count(*) filter (
      where rel.relname = 'blog_image_host_config'
        and constraint_row.conname in (
          'blog_image_host_config_pkey',
          'blog_image_host_config_singleton_check',
          'blog_image_host_config_upload_origin_check',
          'blog_image_host_config_public_origin_check',
          'blog_image_host_config_legacy_origins_check',
          'blog_image_host_config_current_not_legacy_check',
          'blog_image_host_config_version_check',
          'blog_image_host_config_reason_check'
        )
    ) = 8 as config_constraints_ready,
    count(*) filter (
      where rel.relname = 'blog_image_host_events'
        and constraint_row.conname in (
          'blog_image_host_events_pkey',
          'blog_image_host_events_type_check',
          'blog_image_host_events_version_check',
          'blog_image_host_events_previous_config_check',
          'blog_image_host_events_new_config_check',
          'blog_image_host_events_reason_check',
          'blog_image_host_events_validation_summary_check',
          'blog_image_host_events_new_version_key'
        )
    ) = 8 as event_constraints_ready
  from pg_constraint constraint_row
  join pg_class rel on rel.oid = constraint_row.conrelid
  join pg_namespace namespace on namespace.oid = rel.relnamespace
  where namespace.nspname = 'public'
    and rel.relname in ('blog_image_host_config', 'blog_image_host_events')
),
rls as (
  select
    coalesce(bool_and(relrowsecurity and relforcerowsecurity), false) as rls_force_ready
  from pg_class rel
  join pg_namespace namespace on namespace.oid = rel.relnamespace
  where namespace.nspname = 'public'
    and rel.relname in ('blog_image_host_config', 'blog_image_host_events')
),
policies as (
  select count(*) = 0 as no_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in ('blog_image_host_config', 'blog_image_host_events')
),
functions as (
  select
    to_regprocedure('public.normalize_blog_image_host_origin(text)') as normalize_origin_oid,
    to_regprocedure('public.normalize_blog_image_host_origins(text[])') as normalize_origins_oid,
    to_regprocedure('public.validate_blog_image_host_summary(jsonb)') as validate_summary_oid,
    to_regprocedure(
      'public.activate_blog_image_host_config(bigint,text,text,text[],uuid,text,jsonb)'
    ) as activate_oid,
    to_regprocedure(
      'public.rollback_blog_image_host_config(bigint,uuid,text,jsonb)'
    ) as rollback_oid
),
function_security as (
  select
    count(*) filter (
      where proc.oid in (functions.activate_oid, functions.rollback_oid)
        and proc.prosecdef
        and 'search_path=pg_catalog, public' = any(coalesce(proc.proconfig, '{}'::text[]))
    ) = 2 as rpc_security_ready,
    count(*) filter (
      where proc.oid in (
        functions.normalize_origin_oid,
        functions.normalize_origins_oid,
        functions.validate_summary_oid
      )
        and not proc.prosecdef
        and proc.provolatile = 'i'
    ) = 3 as helper_security_ready
  from functions
  left join pg_proc proc on proc.oid in (
    functions.normalize_origin_oid,
    functions.normalize_origins_oid,
    functions.validate_summary_oid,
    functions.activate_oid,
    functions.rollback_oid
  )
),
function_permissions as (
  select
    coalesce(has_function_privilege('service_role', activate_oid, 'EXECUTE'), false)
      and coalesce(has_function_privilege('service_role', rollback_oid, 'EXECUTE'), false)
      and not coalesce(has_function_privilege('anon', activate_oid, 'EXECUTE'), false)
      and not coalesce(has_function_privilege('authenticated', activate_oid, 'EXECUTE'), false)
      and not coalesce(has_function_privilege('anon', rollback_oid, 'EXECUTE'), false)
      and not coalesce(has_function_privilege('authenticated', rollback_oid, 'EXECUTE'), false)
      as rpc_permissions_ready,
    not coalesce(has_function_privilege('service_role', normalize_origin_oid, 'EXECUTE'), false)
      and not coalesce(has_function_privilege('service_role', normalize_origins_oid, 'EXECUTE'), false)
      and not coalesce(has_function_privilege('service_role', validate_summary_oid, 'EXECUTE'), false)
      and not coalesce(has_function_privilege('anon', normalize_origin_oid, 'EXECUTE'), false)
      and not coalesce(has_function_privilege('authenticated', normalize_origin_oid, 'EXECUTE'), false)
      and not coalesce(has_function_privilege('anon', normalize_origins_oid, 'EXECUTE'), false)
      and not coalesce(has_function_privilege('authenticated', normalize_origins_oid, 'EXECUTE'), false)
      and not coalesce(has_function_privilege('anon', validate_summary_oid, 'EXECUTE'), false)
      and not coalesce(has_function_privilege('authenticated', validate_summary_oid, 'EXECUTE'), false)
      as helper_permissions_ready
  from functions
),
table_permissions as (
  select
    has_table_privilege('service_role', 'public.blog_image_host_config', 'SELECT')
      and has_table_privilege('service_role', 'public.blog_image_host_events', 'SELECT')
      and not has_table_privilege('service_role', 'public.blog_image_host_config', 'INSERT')
      and not has_table_privilege('service_role', 'public.blog_image_host_config', 'UPDATE')
      and not has_table_privilege('service_role', 'public.blog_image_host_config', 'DELETE')
      and not has_table_privilege('service_role', 'public.blog_image_host_events', 'INSERT')
      and not has_table_privilege('service_role', 'public.blog_image_host_events', 'UPDATE')
      and not has_table_privilege('service_role', 'public.blog_image_host_events', 'DELETE')
      as service_role_table_permissions_ready,
    not has_table_privilege('anon', 'public.blog_image_host_config', 'SELECT')
      and not has_table_privilege('authenticated', 'public.blog_image_host_config', 'SELECT')
      and not has_table_privilege('anon', 'public.blog_image_host_events', 'SELECT')
      and not has_table_privilege('authenticated', 'public.blog_image_host_events', 'SELECT')
      and not has_table_privilege('anon', 'public.blog_image_host_config', 'INSERT')
      and not has_table_privilege('anon', 'public.blog_image_host_config', 'UPDATE')
      and not has_table_privilege('anon', 'public.blog_image_host_config', 'DELETE')
      and not has_table_privilege('authenticated', 'public.blog_image_host_config', 'INSERT')
      and not has_table_privilege('authenticated', 'public.blog_image_host_config', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.blog_image_host_config', 'DELETE')
      and not has_table_privilege('anon', 'public.blog_image_host_events', 'INSERT')
      and not has_table_privilege('anon', 'public.blog_image_host_events', 'UPDATE')
      and not has_table_privilege('anon', 'public.blog_image_host_events', 'DELETE')
      and not has_table_privilege('authenticated', 'public.blog_image_host_events', 'INSERT')
      and not has_table_privilege('authenticated', 'public.blog_image_host_events', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.blog_image_host_events', 'DELETE')
      as browser_table_permissions_ready
),
initial_config as (
  select
    count(*) = 1
      and bool_and(
        id = 1
        and upload_api_origin = 'https://img.x1file.top'
        and public_asset_origin = 'https://img.x1file.top'
        and legacy_asset_origins = '{}'::text[]
        and version = 1
        and updated_by is null
      ) as initial_config_ready
  from public.blog_image_host_config
),
initial_events as (
  select count(*) = 0 as initial_events_empty
  from public.blog_image_host_events
),
checks as (
  select
    relations.*,
    columns.*,
    constraints_ready.*,
    rls.*,
    policies.*,
    (functions.normalize_origin_oid is not null
      and functions.normalize_origins_oid is not null
      and functions.validate_summary_oid is not null
      and functions.activate_oid is not null
      and functions.rollback_oid is not null) as functions_exist,
    function_security.*,
    function_permissions.*,
    table_permissions.*,
    initial_config.*,
    initial_events.*
  from relations
  cross join columns
  cross join constraints_ready
  cross join rls
  cross join policies
  cross join functions
  cross join function_security
  cross join function_permissions
  cross join table_permissions
  cross join initial_config
  cross join initial_events
)
select
  '20260809-image-host-p3-v1' as revision,
  (
    config_table_exists
    and events_table_exists
    and config_columns_ready
    and event_columns_ready
    and config_constraints_ready
    and event_constraints_ready
    and rls_force_ready
    and no_policies
    and functions_exist
    and rpc_security_ready
    and helper_security_ready
    and rpc_permissions_ready
    and helper_permissions_ready
    and service_role_table_permissions_ready
    and browser_table_permissions_ready
    and initial_config_ready
    and initial_events_empty
  ) as ready,
  to_jsonb(checks) as checks
from checks;
