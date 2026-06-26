-- 068: 移除 V2 手動覆蓋售價欄位（售價改由套餐選項貨號連動套餐售價，覆蓋已不再使用）
ALTER TABLE shopee_product_options_v2 DROP COLUMN IF EXISTS price_override;
