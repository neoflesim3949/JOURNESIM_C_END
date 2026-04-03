-- 訂單收件人/物流資訊
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;

-- 子訂單物流狀態欄位（015 已有 tracking_number）
ALTER TABLE sub_orders ADD COLUMN IF NOT EXISTS shipping_status TEXT;
-- shipping_status: null | preparing | shipped | delivered
