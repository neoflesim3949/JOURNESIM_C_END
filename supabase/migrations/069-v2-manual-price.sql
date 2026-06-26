-- 069: V2 未對應套餐選項時的人工售價（有套餐選項貨號時以套餐售價為準，這欄忽略）
ALTER TABLE shopee_product_options_v2 ADD COLUMN IF NOT EXISTS manual_price NUMERIC;
COMMENT ON COLUMN shopee_product_options_v2.manual_price IS '未對應套餐選項時的人工售價；有對應則以套餐售價為準';
