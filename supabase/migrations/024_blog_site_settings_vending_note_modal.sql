-- VENDING_MODE2:标准主题点击贩售机先弹购买说明开关
-- 读写方:src/lib/blog/vendingSettings.ts(readVendingSettingsColumns/applyMerchantVendingUpdate)
-- 语义:
-- - null/false = 关闭(点击贩售机按钮直接新标签跳转,现状 dfd7ae84 前的行为回归默认);
-- - true = 开启(先弹 StatsWidget 购买说明弹窗,弹窗内 CTA 再跳转);
-- - 仅 standard 系主题(anzifan/standard/touchgal,含 about 页)生效;tweet/gallery/shop 不消费。
-- 降级:未执行本迁移时,新列读取降级 null(按 false 处理)、写入失败仅 console.warn 不阻断。
alter table public.blog_site_settings
  add column if not exists vending_note_modal boolean;

comment on column public.blog_site_settings.vending_note_modal is
  'VENDING_MODE2: 标准主题点击贩售机先弹购买说明开关；null/false=直接跳转';
