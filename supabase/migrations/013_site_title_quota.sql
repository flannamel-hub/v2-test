-- 网站名称修改三日冷却，按商户 site_id 记录
-- 目的：改名称会触发全站 revalidate，避免频繁修改消耗 Vercel 配额
alter table public.blog_site_settings
  add column if not exists last_site_title_change_at timestamptz;

comment on column public.blog_site_settings.last_site_title_change_at is
  '上次修改网站名称时间（3 日内仅可修改一次，避免全站 revalidate 消耗 Vercel 配额）';
