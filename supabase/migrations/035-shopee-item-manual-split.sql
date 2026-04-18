-- 蝦皮訂單明細：支援拆單與手動加入品項
ALTER TABLE shopee_order_items
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN shopee_order_items.is_manual IS '是否為手動新增品項（非來自蝦皮訂單原始資料）';
