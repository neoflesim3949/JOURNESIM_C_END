-- 自設名稱搬進 V2 + 訂單快照
-- V2 成為自設名稱的家；訂單明細在匯入時快照名稱，標籤/收據讀快照、不再連 id-mappings

-- 1. V2 選項主檔：自設名稱欄
ALTER TABLE shopee_product_options_v2
  ADD COLUMN IF NOT EXISTS custom_product_name TEXT,
  ADD COLUMN IF NOT EXISTS custom_variation_name TEXT;

-- 2. 訂單明細：自設名稱快照欄
ALTER TABLE shopee_order_items
  ADD COLUMN IF NOT EXISTS custom_product_name TEXT,
  ADD COLUMN IF NOT EXISTS custom_variation_name TEXT;

-- 3. Backfill：把現有 id-mappings 的自設名稱搬進 V2 與訂單明細
-- 3a. V2：規格自設名稱（依選項ID）
UPDATE shopee_product_options_v2 o
   SET custom_variation_name = m.display_name
  FROM shopee_variation_id_mappings m
 WHERE m.shopee_variation_id = o.shopee_variation_id;

-- 3b. V2：商品自設名稱（先依商品ID）
UPDATE shopee_product_options_v2 o
   SET custom_product_name = m.display_name
  FROM shopee_product_id_mappings m
 WHERE m.shopee_product_id = o.shopee_product_id;

-- 3c. V2：商品自設名稱（NULL 的再依完整編碼 商品ID_選項ID）
UPDATE shopee_product_options_v2 o
   SET custom_product_name = m.display_name
  FROM shopee_product_id_mappings m
 WHERE o.custom_product_name IS NULL
   AND m.shopee_product_id = o.shopee_product_id || '_' || o.shopee_variation_id;

-- 3d. 訂單明細：規格自設名稱（依選項ID）
UPDATE shopee_order_items i
   SET custom_variation_name = m.display_name
  FROM shopee_variation_id_mappings m
 WHERE m.shopee_variation_id = i.shopee_variation_id;

-- 3e. 訂單明細：商品自設名稱（先依完整編碼，再依商品ID）
UPDATE shopee_order_items i
   SET custom_product_name = m.display_name
  FROM shopee_product_id_mappings m
 WHERE m.shopee_product_id = i.shopee_sku_code;

UPDATE shopee_order_items i
   SET custom_product_name = m.display_name
  FROM shopee_product_id_mappings m
 WHERE i.custom_product_name IS NULL
   AND m.shopee_product_id = i.shopee_product_id;

COMMENT ON COLUMN shopee_product_options_v2.custom_product_name IS '商品自設名稱（V2 當家，整個商品共用）';
COMMENT ON COLUMN shopee_product_options_v2.custom_variation_name IS '規格自設名稱（V2 當家，依選項）';
COMMENT ON COLUMN shopee_order_items.custom_product_name IS '匯入時快照的商品自設名稱（標籤/收據讀此，不連 mapping）';
COMMENT ON COLUMN shopee_order_items.custom_variation_name IS '匯入時快照的規格自設名稱（標籤/收據讀此，不連 mapping）';
