-- ============================================================================
-- SYS-OPT1 V-A 迁移 025 preflight（只读断言；执行库=tyec 共用库）
-- 期望：table_absent=true（首装）或 table_absent=false 且 existing_col_count=5（重跑）；func_conflicts=0
-- ============================================================================

select
  (not exists (select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'blog_platform_settings')) as table_absent,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'blog_platform_settings') as existing_col_count,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname ilike '%blog_platform_settings%') as func_conflicts;
