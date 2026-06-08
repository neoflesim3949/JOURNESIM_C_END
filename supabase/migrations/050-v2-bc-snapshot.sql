-- 商品對應 V2：記下對應當下的 BC 品名與成本快照
-- 之後 BC 同步若品名/成本變了，列表比對快照即可標紅警示
ALTER TABLE shopee_product_options_v2
  ADD COLUMN IF NOT EXISTS bc_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS bc_cost_snapshot NUMERIC;

-- 回填：以目前 bc_products 為基準（既有對應視為「已同步」）
UPDATE shopee_product_options_v2 o
   SET bc_name_snapshot = p.name,
       bc_cost_snapshot = (
         SELECT (elem ->> 'settlementPrice')::numeric
           FROM jsonb_array_elements(COALESCE(p.prices, '[]'::jsonb)) elem
          WHERE elem ->> 'copies' = o.copies
          LIMIT 1
       )
  FROM bc_products p
 WHERE p.sku_id = o.bc_sku_id
   AND o.bc_sku_id IS NOT NULL;

COMMENT ON COLUMN shopee_product_options_v2.bc_name_snapshot IS '對應當下的 BC 品名快照（與現況比對偵測變更）';
COMMENT ON COLUMN shopee_product_options_v2.bc_cost_snapshot IS '對應當下的 BC 結算成本(CNY)快照';
