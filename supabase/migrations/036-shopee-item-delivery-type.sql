-- 蝦皮訂單明細：區分 SIM / eSIM + eSIM 交付資訊
ALTER TABLE shopee_order_items
  ADD COLUMN IF NOT EXISTS delivery_type TEXT DEFAULT 'sim',
  ADD COLUMN IF NOT EXISTS qr_code_url TEXT,
  ADD COLUMN IF NOT EXISTS lpa_code TEXT;

COMMENT ON COLUMN shopee_order_items.delivery_type IS 'sim（實體卡/儲值）或 esim（eSIM 新建）';
COMMENT ON COLUMN shopee_order_items.qr_code_url IS 'eSIM QR Code 圖片 URL（N009 webhook 回寫）';
COMMENT ON COLUMN shopee_order_items.lpa_code IS 'eSIM LPA/啟用碼（N009 webhook 回寫）';
