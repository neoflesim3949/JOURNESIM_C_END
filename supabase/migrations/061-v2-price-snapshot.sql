-- 061: V2 記下對應當下的套餐售價快照（前次售價），套餐改價時可比對顯示前次
ALTER TABLE shopee_product_options_v2 ADD COLUMN IF NOT EXISTS price_snapshot NUMERIC;
COMMENT ON COLUMN shopee_product_options_v2.price_snapshot IS '對應當下的套餐售價快照（前次售價）；與目前套餐售價不同時於 V2 標示';
