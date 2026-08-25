-- P14:BLOG 内容保护开关(全主题)
-- Revision: 20260825.blog-site-settings-content-protect.1
-- blog_site_settings 增列 content_protect:
-- - true 时读者端(全主题)启用客户端内容防护(禁右键/复制/图片拖存);
-- - BLOG 后台开关保存,仅写本列,不触碰 theme_code 等其余列;
-- - /admin 后台路径不受防护影响(客户端注入时排除)。
-- 执行顺序:
--   supabase/scripts/preflight-blog-site-settings-content-protect.sql(只读,期望 ready=true)
--   → 本迁移 → supabase/scripts/verify-blog-site-settings-content-protect.sql(只读,期望 ready=true)

alter table public.blog_site_settings
  add column if not exists content_protect boolean not null default false;

comment on column public.blog_site_settings.content_protect is
  'P14:内容保护开关(全主题客户端防护;true 时读者端禁右键/复制/图片拖存;/admin 不受影响)';
