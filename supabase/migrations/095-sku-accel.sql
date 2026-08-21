-- 人工為每組「1GB 基礎方案」選定對應的加速包 SKU（存在該基礎方案的 sku_meta 列）
-- 成本重算以此優先取 accel_prices.acceleratePrice；未選則用基礎單日價估
alter table sku_meta add column if not exists accel_sku_id text;
