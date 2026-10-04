-- VENDING_MODE:贩售机组件三态圆点模式(关闭|官方贩售机链接|自定义链接)
-- 读写方:src/lib/blog/vendingSettings.ts(getVendingAdminState/applyMerchantVendingUpdate/applyPlatformVendingSync)
-- 语义:
-- - vending_mode ∈ {'official','custom'},null/未知一律按 'official' 处理;
-- - vending_official_*:平台统一维护的官方快照(平台同步调用方写入);
-- - vending_custom_*:商户自定义提交值(商户后台保存 custom 模式时写入);
-- - 不回填、不动 vending_enabled(兼容层语义保留)。
-- 降级:未执行本迁移时,新列读取降级 null、写入失败仅 console.warn 不阻断。
alter table public.blog_site_settings
  add column if not exists vending_mode text,
  add column if not exists vending_official_title text,
  add column if not exists vending_official_url text,
  add column if not exists vending_custom_title text,
  add column if not exists vending_custom_url text;

comment on column public.blog_site_settings.vending_mode is
  'VENDING_MODE:贩售机模式 official|custom(null/未知一律按 official 处理)';

comment on column public.blog_site_settings.vending_official_title is
  'VENDING_MODE:平台统一维护的官方贩售机按钮名称快照(平台同步写入)';

comment on column public.blog_site_settings.vending_official_url is
  'VENDING_MODE:平台统一维护的官方贩售机地址快照(平台同步写入)';

comment on column public.blog_site_settings.vending_custom_title is
  'VENDING_MODE:商户自定义贩售机按钮名称(后台保存 custom 模式时写入)';

comment on column public.blog_site_settings.vending_custom_url is
  'VENDING_MODE:商户自定义贩售机地址(后台保存 custom 模式时写入)';
