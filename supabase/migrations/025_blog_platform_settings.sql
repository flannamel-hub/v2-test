-- ============================================================================
-- SYS-OPT1 V-A · 平台级主题控制单例表（blog_platform_settings）
-- Revision: 20261007.sysopt1-va.1
-- 执行库：tyec 共用库（BLOG 侧 Supabase project；v2 站点经 NEXT_PUBLIC_SUPABASE_URL 同库读取）
-- 依据：pro 仓 SYS_OPT1_REQUIREMENTS.md §3.1/§4/§10（拍板 1A/2A）
--
-- 内容：
--   1) 单行表（id 恒为 1）：
--      theme_switch_limit_enabled boolean not null default true —— 全局切换限制开关
--      disabled_themes jsonb not null default '[]' —— 被禁用主题（规范 ThemeId 数组；
--        CHECK jsonb_typeof='array'；读取端对元素/未知项容错过滤）
--      updated_at / updated_by
--   2) seed 单行 id=1（幂等）
--   3) ACL：revoke public/anon/authenticated + grant service_role（pro/v2 均以 service role 读写）
--
-- 边界：缺行/读失败/缺表 → 读取端 fail-safe=限开(true)+空禁用集（现行为）；
--       本迁移为简单 DDL（无 $$ 函数体），幂等可重复执行。
-- ============================================================================

begin;

create table if not exists public.blog_platform_settings (
  id smallint primary key default 1 check (id = 1),
  theme_switch_limit_enabled boolean not null default true,
  disabled_themes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(disabled_themes) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.blog_platform_settings (id)
values (1)
on conflict (id) do nothing;

comment on table public.blog_platform_settings is
  'SYS-OPT1 V-A:平台级 BLOG 主题控制(全局切换限制开关 + 按主题开放/关闭);单行 id=1';

comment on column public.blog_platform_settings.theme_switch_limit_enabled is
  'SYS-OPT1:全局主题切换限制开关(true=24h 上限 4 次生效);读取失败/缺行按 true(现行为)';

comment on column public.blog_platform_settings.disabled_themes is
  'SYS-OPT1:被禁用主题数组(规范 ThemeId:anzifan/touchgal/gallery/tweet/tweet-light/tweet-dark/shop/shop-v2);禁用主题在 BLOG 后台隐藏且服务端拒绝切入';

revoke all on table public.blog_platform_settings from public, anon, authenticated;
grant all on table public.blog_platform_settings to service_role;

notify pgrst, 'reload schema';

commit;
