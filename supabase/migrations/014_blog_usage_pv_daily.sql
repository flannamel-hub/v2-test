-- ============================================================
-- BLOG 分层 P2:页面浏览(PV)原始日计数(多租户 site_id)
-- Revision: 20260824.blog-usage-p2.1
--
-- 共用库(bloggallery):site_id 即主站 merchant_services.id,
-- 主站 cron 按 site_id = service_id 直接聚合。
-- day 为 Asia/Shanghai 自然日(BLOG 侧 /api/internal/pv-flush 计算)。
--
-- 执行顺序:
--   supabase/scripts/preflight-blog-usage-pv-daily.sql(只读,期望 ready=true)
--   → 本迁移 → supabase/scripts/verify-blog-usage-pv-daily.sql(只读,期望 ready=true)
-- ============================================================

create table if not exists public.blog_usage_pv_daily (
  site_id uuid not null,
  day date not null,
  pv bigint not null default 0 check (pv >= 0),
  updated_at timestamptz not null default now(),
  primary key (site_id, day)
);

comment on table public.blog_usage_pv_daily is
  'BLOG 分层 P2:每站点自然日 PV 原始计数(site_id = 主站 merchant_services.id;day 为 Asia/Shanghai 自然日;仅服务端写入)';

alter table public.blog_usage_pv_daily enable row level security;

-- 仅服务端(service_role / BLOG 侧 admin client)可写;anon/authenticated 零权限:
revoke all on public.blog_usage_pv_daily from public, anon, authenticated;
grant all on public.blog_usage_pv_daily to service_role;

-- ------------------------------------------------------------
-- 原子累加 RPC(参照 post_stats.increment_post_stat 模式):
-- INSERT ... ON CONFLICT (site_id, day)
--   DO UPDATE SET pv = blog_usage_pv_daily.pv + EXCLUDED.pv
-- 单次上报钳制在 1000 以内(与 /api/internal/pv-flush 的 count 校验一致)。
-- ------------------------------------------------------------
create or replace function public.record_blog_usage_pv(
  p_site_id uuid,
  p_day date,
  p_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_site_id is null or p_day is null then
    return;
  end if;
  if p_count is null or p_count <= 0 then
    return;
  end if;

  insert into public.blog_usage_pv_daily (site_id, day, pv)
  values (p_site_id, p_day, least(greatest(p_count, 1), 1000))
  on conflict (site_id, day) do update
  set
    pv = public.blog_usage_pv_daily.pv + excluded.pv,
    updated_at = now();
end;
$$;

revoke all on function public.record_blog_usage_pv(uuid, date, integer)
  from public, anon, authenticated;
grant execute on function public.record_blog_usage_pv(uuid, date, integer)
  to service_role;
