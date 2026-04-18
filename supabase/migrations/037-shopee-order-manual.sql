-- 蝦皮訂單：標記手動建立訂單（與匯入訂單區分）
ALTER TABLE shopee_orders
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN shopee_orders.is_manual IS '是否為手動新增的訂單（非匯入自蝦皮 Excel）';
