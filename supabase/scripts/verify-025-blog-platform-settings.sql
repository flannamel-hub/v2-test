-- ============================================================================
-- SYS-OPT1 V-A 迁移 025 verify（只读断言；执行库=tyec 共用库）
-- 期望：table_exists=true / seed_rows=1 / col_count=5 / check_count=1 / anon_acl_rows=0
-- ============================================================================

select
  (select exists (select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'blog_platform_settings')) as table_exists,
  (select count(*) from public.blog_platform_settings where id = 1) as seed_rows,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'blog_platform_settings'
       and column_name in ('id','theme_switch_limit_enabled','disabled_themes','updated_at','updated_by')) as col_count,
  (select count(*) from pg_constraint
     where conname = 'blog_platform_settings_disabled_themes_check') as check_count,
  (select count(*) from information_schema.role_table_grants
     where table_name = 'blog_platform_settings'
       and grantee in ('public','anon','authenticated')) as anon_acl_rows;
