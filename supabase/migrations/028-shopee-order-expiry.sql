-- 使用期限放在訂單層級（同一訂單所有卡片同一日期）
ALTER TABLE shopee_orders ADD COLUMN IF NOT EXISTS expiry_date DATE;
-- 標籤字體設定（JSON: {line1: 12, line2: 12, line3: 10}）
ALTER TABLE shopee_orders ADD COLUMN IF NOT EXISTS label_settings JSONB;
