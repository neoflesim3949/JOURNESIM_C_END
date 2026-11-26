-- 復充商品系列 id / 名稱（F002 rechargeableProductSeriesId / rechargeableProductSeriesName）
-- 原本只存了 rechargeable_product（migration 011），系列 id/名稱 BC 有回但被丟棄，這裡補上兩欄
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS rechargeable_product_series_id text;
ALTER TABLE bc_products ADD COLUMN IF NOT EXISTS rechargeable_product_series_name text;
