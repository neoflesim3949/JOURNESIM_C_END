-- 方案分組：把同系列（只差每日GB）的 SKU 手動歸為一組，並指定該組的「1GB 基礎方案」
-- 供「成本重算」使用；手動分組優先於品名自動判斷
alter table sku_meta add column if not exists family_id text;         -- 群組鍵（同組同值）
alter table sku_meta add column if not exists is_base boolean default false;  -- 該組的 1GB 基礎方案
alter table sku_meta add column if not exists daily_gb numeric;       -- 品名解析的每日GB（快取，可空）

create index if not exists idx_sku_meta_family on sku_meta(family_id);
