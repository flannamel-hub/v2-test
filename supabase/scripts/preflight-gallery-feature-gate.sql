-- 图库基座手术 批1 preflight:blog_site_settings 增列 gallery_feature_enabled(只读)
-- Revision: 20260930.gallery-feature-gate.1
-- 执行本库(bloggallery)supabase/migrations/021_gallery_feature_gate.sql 前运行。
-- 期望 ready=true。本脚本不创建或修改任何数据。
-- 断言:blog_site_settings 表存在、site_id 列存在、gallery_feature_enabled 列不存在(迁移前状态);
-- 并打印目标行(内部站)当前存在性与 theme_code(诊断用,列存在性判定不受行数据影响)。

with relations as (
  select to_regclass('public.blog_site_settings') is not null as settings_exists
),
columns as (
  select
    count(*) filter (where column_name = 'site_id') = 1 as site_id_present,
    count(*) filter (where column_name = 'gallery_feature_enabled') = 0 as gallery_feature_enabled_absent
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'blog_site_settings'
),
report as (
  select
    relations.*,
    columns.*,
    -- 诊断:目标行存在性与 theme_code(to_jsonb 整行,不逐列引用,列缺失不报错)
    case when relations.settings_exists then coalesce((
      select jsonb_agg(to_jsonb(s))
      from public.blog_site_settings s
      where (to_jsonb(s) ->> 'site_id') = '88a5f95a-e5bf-4cad-99c1-ed56f82f0044'
    ), '[]'::jsonb) else null end as target_row_diag
  from relations cross join columns
)
select
  '20260930.gallery-feature-gate.1' as revision,
  (settings_exists and site_id_present and gallery_feature_enabled_absent) as ready,
  to_jsonb(report) as checks,
  case
    when not settings_exists then
      'blog_site_settings is missing; run 003_blog_site_settings.sql first.'
    when not site_id_present then
      'site_id column missing; inspect blog_site_settings before running migration.'
    when not gallery_feature_enabled_absent then
      'gallery_feature_enabled column already exists; inspect before running migration.'
    else 'Ready. Run 021_gallery_feature_gate.sql, then verify-gallery-feature-gate.sql.'
  end as next_step
from report;
