-- 图库基座手术 批1:blog_site_settings 增列 gallery_feature_enabled(图库功能开关)
-- Revision: 20260930.gallery-feature-gate.1
-- 依据:GALLERY_BASE_SURGERY_PLAN.md §3.1 / GALLERY_BASE_SURGERY_B1_BRIEF.md §1.1
-- gallery_feature_enabled boolean not null default false:
-- - 图库功能改为内部站专属;未开启 = 编辑器隐藏图库步骤 / 不可切换 Gallery 主题 /
--   爬虫入库跳过图库同步 / gallery 与 gallery-storage 管理 API 503;
-- - 默认关闭;现役图库主力站(内部站)由下方回填 UPDATE 保持开启(幂等);
-- - 服务端读取件 src/lib/blog/galleryFeatureGate.ts 为 fail-closed:
--   缺列 / 读取失败 / 无行 / 值非 true 一律 false,无 last-known-good;
-- - 公开读 /api/gallery/[slug] 与 /api/gallery/post-stats 不设此门控
--   (按方案 §3.7:公开读零回归,存量读不受影响)。
-- 执行顺序:
--   supabase/scripts/preflight-gallery-feature-gate.sql(只读,期望 ready=true)
--   → 本迁移 → supabase/scripts/verify-gallery-feature-gate.sql(只读,期望 ready=true)

alter table public.blog_site_settings
  add column if not exists gallery_feature_enabled boolean not null default false;

comment on column public.blog_site_settings.gallery_feature_enabled is
  '图库功能开关（内部站专用；未开启=编辑器隐藏图库步骤/不可切换 Gallery 主题/爬虫不入库图库）；默认关闭';

-- 回填：现役图库主力站（内部站）保持开启；幂等
update public.blog_site_settings
  set gallery_feature_enabled = true, updated_at = now()
  where site_id = '88a5f95a-e5bf-4cad-99c1-ed56f82f0044';
