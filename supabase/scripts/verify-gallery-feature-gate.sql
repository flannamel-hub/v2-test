-- 图库基座手术 批1 verify:blog_site_settings 增列 gallery_feature_enabled(只读)
-- Revision: 20260930.gallery-feature-gate.1
-- 执行本库(bloggallery)supabase/migrations/021_gallery_feature_gate.sql 后运行。
-- 期望 ready=true;连跑两次结果一致(幂等)。本脚本不修改任何数据。
-- 断言:列存在且 boolean / not null / default false;
--   目标行(内部站)gallery_feature_enabled = true;其余行全部 false。
-- 行状态读取用 to_jsonb 整行取键:列缺失时不抛 SQL 错,优雅返回 ready=false
--   并提示先跑迁移(直接引用列名的语句在解析期就会失败,无法给出文案)。

with relations as (
  select to_regclass('public.blog_site_settings') is not null as settings_exists
),
gate_column as (
  select
    count(*) filter (
      where column_name = 'gallery_feature_enabled'
        and data_type = 'boolean'
        and is_nullable = 'NO'
    ) = 1 as gate_column_ok,
    count(*) filter (
      where column_name = 'gallery_feature_enabled'
        and column_default = 'false'
    ) = 1 as default_false_ok
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'blog_site_settings'
),
rows_state as (
  select
    count(*) filter (
      where (r.row_json ->> 'site_id') = '88a5f95a-e5bf-4cad-99c1-ed56f82f0044'
    ) = 1 as target_row_present,
    count(*) filter (
      where (r.row_json ->> 'site_id') = '88a5f95a-e5bf-4cad-99c1-ed56f82f0044'
        and (r.row_json ->> 'gallery_feature_enabled') = 'true'
    ) = 1 as target_row_enabled,
    count(*) filter (
      where (r.row_json ->> 'gallery_feature_enabled') = 'true'
        and coalesce(r.row_json ->> 'site_id', '') <> '88a5f95a-e5bf-4cad-99c1-ed56f82f0044'
    ) = 0 as others_all_disabled
  from (
    select to_jsonb(s) as row_json
    from public.blog_site_settings s
  ) r
)
select
  '20260930.gallery-feature-gate.1' as revision,
  (
    settings_exists
    and gate_column_ok and default_false_ok
    and target_row_present and target_row_enabled and others_all_disabled
  ) as ready,
  jsonb_build_object(
    'relations', to_jsonb(relations),
    'gate_column', to_jsonb(gate_column),
    'rows_state', to_jsonb(rows_state)
  ) as checks,
  case
    when not settings_exists then 'blog_site_settings is missing; run 003 first.'
    when not (gate_column_ok and default_false_ok) then
      'gallery_feature_enabled column missing or shape mismatch; run 021_gallery_feature_gate.sql first.'
    when not target_row_present then
      '目标行不存在（回填 UPDATE 幂等，0 行更新无害）。'
    when not target_row_enabled then
      'target row exists but gallery_feature_enabled is not true; re-run 021 backfill update.'
    when not others_all_disabled then
      'unexpected enabled sites beyond the internal one; inspect blog_site_settings.gallery_feature_enabled.'
    else 'Ready. Gallery feature gate live: internal site enabled, all other sites disabled.'
  end as next_step
from relations, gate_column, rows_state;
